import type { StreamEvent } from "./stream-event.js";

const defaultAssistantVisibleContentFallback = "我会继续整理并推进这个任务。";
const collaborationPlaceholderFallback = "本步未生成可展示内容。";

type JsonCandidate = {
  end: number;
  raw: string;
  start: number;
  value?: unknown;
};

export function stripInternalCollaborationArtifacts(content: string): string {
  const withoutFencedArtifacts = content.replace(
    /```[^\n\r]*(?:\r?\n)([\s\S]*?)```/g,
    (block, body: string) => {
      const artifact = findInternalArtifact(body);

      if (!artifact) {
        return block;
      }

      return artifact.visibleMessage ?? "";
    }
  );
  const candidates = extractJsonCandidates(withoutFencedArtifacts);
  const replacements = candidates
    .flatMap((candidate) => {
      const artifact = findInternalArtifactCandidate(candidate);

      return artifact
        ? [
            {
              end: candidate.end,
              replacement: artifact.visibleMessage ?? "",
              start: candidate.start
            }
          ]
        : [];
    })
    .sort((left, right) => right.start - left.start);

  let cleaned = withoutFencedArtifacts;

  for (const replacement of replacements) {
    cleaned = [
      cleaned.slice(0, replacement.start),
      replacement.replacement,
      cleaned.slice(replacement.end)
    ].join("");
  }

  return normalizeVisibleWhitespace(cleaned);
}

export function sanitizeAssistantVisibleContent(
  content: string,
  options: { fallback?: string; stripCollaborationPlaceholders?: boolean } = {}
): string {
  const cleaned = normalizeVisibleWhitespace(
    options.stripCollaborationPlaceholders
      ? stripVisibleCollaborationPlaceholders(stripInternalCollaborationArtifacts(content))
      : stripInternalCollaborationArtifacts(content)
  );

  return cleaned.length > 0
    ? cleaned
    : (options.fallback ??
        (options.stripCollaborationPlaceholders
          ? collaborationPlaceholderFallback
          : defaultAssistantVisibleContentFallback));
}

export function sanitizeAssistantVisibleStreamEvents(
  events: StreamEvent[]
): StreamEvent[] {
  return events.map((event) => {
    if (event.kind === "conversation.message.delta") {
      return {
        ...event,
        payload: {
          ...event.payload,
          delta: stripInternalCollaborationArtifacts(event.payload.delta)
        }
      };
    }

    if (event.kind === "conversation.message.completed") {
      return {
        ...event,
        payload: {
          ...event.payload,
          finalContent: sanitizeAssistantVisibleContent(event.payload.finalContent)
        }
      };
    }

    return event;
  });
}

function findInternalArtifact(
  input: string | unknown
): { visibleMessage?: string } | null {
  if (typeof input === "string") {
    const candidates = extractJsonCandidates(input);

    for (const candidate of candidates) {
      const artifact = findInternalArtifactCandidate(candidate);

      if (artifact) {
        return artifact;
      }
    }

    return null;
  }

  if (!containsInternalCollaborationArtifact(input)) {
    return null;
  }

  const visibleMessage = extractVisibleMessage(input);

  return visibleMessage ? { visibleMessage } : {};
}

function containsInternalCollaborationArtifact(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsInternalCollaborationArtifact);
  }

  if (!isRecord(value)) {
    return false;
  }

  if (isInternalHandoffControl(value)) {
    return true;
  }

  return Object.values(value).some(containsInternalCollaborationArtifact);
}

function isInternalHandoffControl(value: Record<string, unknown>): boolean {
  const hasHandoffType = value.type === "handoff_request";
  const hasTarget =
    "targetAgentId" in value ||
    "targetParticipantId" in value ||
    "targetRoleKey" in value;
  const hasAcceptanceCriteria = "acceptanceCriteria" in value;
  const hasConstraints = "constraints" in value;
  const hasGoal = "goal" in value;
  const hasArtifactHint =
    "contextEventIds" in value ||
    "expectedArtifact" in value;

  if (hasHandoffType && (hasTarget || hasAcceptanceCriteria || hasConstraints || hasGoal)) {
    return true;
  }

  return (
    hasTarget &&
    hasAcceptanceCriteria &&
    (hasConstraints || hasGoal || hasArtifactHint)
  );
}

function extractVisibleMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const visibleMessage = value.visibleMessage;

  return typeof visibleMessage === "string" && visibleMessage.trim().length > 0
    ? visibleMessage.trim()
    : undefined;
}

function extractJsonCandidates(content: string): JsonCandidate[] {
  const candidates: JsonCandidate[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char !== "{" && char !== "[") {
      continue;
    }

    const end = findJsonCandidateEnd(content, index);

    if (end === -1) {
      continue;
    }

    const raw = content.slice(index, end);
    let value: unknown | undefined;

    try {
      value = JSON.parse(raw);
    } catch {
      value = undefined;
    }

    if (value !== undefined || containsInternalArtifactMarkers(raw)) {
      candidates.push({
        end,
        raw,
        start: index,
        value
      });
      index = end - 1;
    }
  }

  return candidates;
}

function findInternalArtifactCandidate(
  candidate: JsonCandidate
): { visibleMessage?: string } | null {
  if (candidate.value !== undefined) {
    return findInternalArtifact(candidate.value);
  }

  return containsInternalArtifactMarkers(candidate.raw) ? {} : null;
}

function containsInternalArtifactMarkers(raw: string): boolean {
  const hasHandoffType = /["']type["']\s*:\s*["']handoff_request["']/.test(raw);
  const targetMarkerCount = [
    /["']targetAgentId["']\s*:/.test(raw),
    /["']targetParticipantId["']\s*:/.test(raw),
    /["']targetRoleKey["']\s*:/.test(raw)
  ].filter(Boolean).length;
  const controlMarkerCount = [
    /["']goal["']\s*:/.test(raw),
    /["']acceptanceCriteria["']\s*:/.test(raw),
    /["']constraints["']\s*:/.test(raw),
    /["']contextEventIds["']\s*:/.test(raw),
    /["']expectedArtifact["']\s*:/.test(raw)
  ].filter(Boolean).length;

  return (
    (hasHandoffType && (targetMarkerCount > 0 || controlMarkerCount > 0)) ||
    (targetMarkerCount > 0 && controlMarkerCount >= 2)
  );
}

function stripVisibleCollaborationPlaceholders(content: string): string {
  return content
    .split("\n")
    .map((line) => removePlaceholderSentences(line))
    .join("\n")
    .replace(/\b(?:JSON|ORCHESTRATOR|metadata|handoff|target)\b/gi, "")
    .replace(/\b(?:targetAgentId|targetParticipantId|targetRoleKey|acceptanceCriteria)\b/g, "")
    .replace(/[ \t]+([。！？!?，,；;：:])/g, "$1");
}

function removePlaceholderSentences(content: string): string {
  return content.replace(
    /[^。！？!?]*?(?:我(?:将|会|来)?请|稍后|等待(?:其他)?同事|交给[^。！？!?]*(?:同事|AI|工程师|负责人)|交接给[^。！？!?]*(?:同事|AI|工程师|负责人)|转交(?:给)?|让[^。！？!?]*(?:同事|AI|工程师|负责人)[^。！？!?]*(?:继续|处理|推进|接手))[^。！？!?]*(?:[。！？!?]|$)/g,
    ""
  );
}

function findJsonCandidateEnd(content: string, start: number): number {
  const stack: string[] = [];
  let escaped = false;
  let inString = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char !== "}" && char !== "]") {
      continue;
    }

    const expected = stack.pop();

    if (expected !== char) {
      return -1;
    }

    if (stack.length === 0) {
      return index + 1;
    }
  }

  return -1;
}

function normalizeVisibleWhitespace(content: string): string {
  return content
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
