import {
  artifactDiffCreateToolInputSchema,
  artifactMarkdownCreateToolInputSchema,
  artifactWebpageCreateToolInputSchema,
  runtimeDiffArtifactDraftSchema,
  runtimeDiffArtifactToolName,
  runtimeMarkdownArtifactDraftSchema,
  runtimeMarkdownArtifactToolName,
  runtimeWebpageArtifactDraftSchema,
  runtimeWebpageArtifactToolName,
  type MultiAgentOutputEnvelope,
  type RuntimeArtifactDraft
} from "@agenthub/contracts";

const maxDraftsPerResult = 3;

export {
  runtimeDiffArtifactToolName,
  runtimeMarkdownArtifactToolName,
  runtimeWebpageArtifactToolName
};

export function extractRuntimeArtifactDrafts(
  envelope: MultiAgentOutputEnvelope
): RuntimeArtifactDraft[] {
  const drafts: RuntimeArtifactDraft[] = [];

  for (const intent of envelope.intents) {
    if (intent.type !== "tool_plan" || intent.riskLevel !== "low") {
      continue;
    }

    for (const call of intent.calls) {
      const draft = buildArtifactDraftFromToolCall(call.toolName, call.input);

      if (!draft) {
        continue;
      }

      drafts.push(draft);

      if (drafts.length >= maxDraftsPerResult) {
        return drafts;
      }
    }
  }

  return drafts;
}

function buildArtifactDraftFromToolCall(
  toolName: string,
  rawInput: unknown
): RuntimeArtifactDraft | null {
  if (toolName === runtimeMarkdownArtifactToolName) {
    const input = artifactMarkdownCreateToolInputSchema.safeParse(rawInput);

    if (!input.success) {
      return null;
    }

    const draft = runtimeMarkdownArtifactDraftSchema.safeParse({
      fileName: normalizeArtifactFileName(input.data.fileName ?? input.data.title, ".md"),
      markdown: input.data.markdown,
      mimeType: "text/markdown",
      title: normalizeTitle(input.data.title),
      type: "markdown"
    });

    return draft.success ? draft.data : null;
  }

  if (toolName === runtimeWebpageArtifactToolName) {
    const input = artifactWebpageCreateToolInputSchema.safeParse(rawInput);

    if (!input.success) {
      return null;
    }

    const draft = runtimeWebpageArtifactDraftSchema.safeParse({
      fileName: normalizeArtifactFileName(input.data.fileName ?? input.data.title, ".html"),
      html: input.data.html,
      mimeType: "text/html",
      title: normalizeTitle(input.data.title),
      type: "webpage"
    });

    return draft.success ? draft.data : null;
  }

  if (toolName === runtimeDiffArtifactToolName) {
    const input = artifactDiffCreateToolInputSchema.safeParse(rawInput);

    if (!input.success) {
      return null;
    }

    const draft = runtimeDiffArtifactDraftSchema.safeParse({
      fileName: normalizeArtifactFileName(input.data.fileName ?? input.data.title, ".diff"),
      mimeType: "text/x-diff",
      patch: input.data.patch,
      title: normalizeTitle(input.data.title),
      truncated: input.data.truncated,
      type: "diff"
    });

    return draft.success ? draft.data : null;
  }

  return null;
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeArtifactFileName(
  value: string,
  extension: ".diff" | ".html" | ".md"
): string {
  const withoutPath = value
    .trim()
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
    .at(-1) ?? "artifact";
  const withoutControlChars = Array.from(withoutPath)
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;

      return codePoint > 31 && codePoint !== 127;
    })
    .join("");
  const collapsedWhitespace = withoutControlChars.replace(/\s+/g, "-");
  const safeName = collapsedWhitespace
    .replace(/[<>:"|?*%]+/g, "-")
    .replace(/[^a-zA-Z0-9._\-\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[.-]+$/, "");
  const baseName = safeName.length > 0 ? safeName : "artifact";
  const extensionPattern =
    extension === ".md" ? /\.md$/i : extension === ".html" ? /\.html$/i : /\.diff$/i;
  const withExtension = extensionPattern.test(baseName) ? baseName : `${baseName}${extension}`;

  if (withExtension.length <= 160) {
    return withExtension;
  }

  return `${withExtension.slice(0, 160 - extension.length).replace(/[.-]+$/, "")}${extension}`;
}
