import {
  artifactMarkdownCreateToolInputSchema,
  runtimeMarkdownArtifactDraftSchema,
  runtimeMarkdownArtifactToolName,
  type MultiAgentOutputEnvelope,
  type RuntimeMarkdownArtifactDraft
} from "@agenthub/contracts";

const maxDraftsPerResult = 3;

export { runtimeMarkdownArtifactToolName };

export function extractRuntimeArtifactDrafts(
  envelope: MultiAgentOutputEnvelope
): RuntimeMarkdownArtifactDraft[] {
  const drafts: RuntimeMarkdownArtifactDraft[] = [];

  for (const intent of envelope.intents) {
    if (intent.type !== "tool_plan" || intent.riskLevel !== "low") {
      continue;
    }

    for (const call of intent.calls) {
      if (call.toolName !== runtimeMarkdownArtifactToolName) {
        continue;
      }

      const input = artifactMarkdownCreateToolInputSchema.safeParse(call.input);

      if (!input.success) {
        continue;
      }

      const draft = runtimeMarkdownArtifactDraftSchema.safeParse({
        fileName: normalizeMarkdownFileName(input.data.fileName ?? input.data.title),
        markdown: input.data.markdown,
        mimeType: "text/markdown",
        title: normalizeTitle(input.data.title),
        type: "markdown"
      });

      if (!draft.success) {
        continue;
      }

      drafts.push(draft.data);

      if (drafts.length >= maxDraftsPerResult) {
        return drafts;
      }
    }
  }

  return drafts;
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeMarkdownFileName(value: string): string {
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
  const withExtension = /\.md$/i.test(baseName) ? baseName : `${baseName}.md`;

  if (withExtension.length <= 160) {
    return withExtension;
  }

  const extension = ".md";
  return `${withExtension.slice(0, 160 - extension.length).replace(/[.-]+$/, "")}${extension}`;
}
