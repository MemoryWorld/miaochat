import type { RuntimeArtifactStatus } from "@agenthub/contracts";

export type ArtifactStatusesByMessageId = Record<string, RuntimeArtifactStatus[]>;

export function mergeRuntimeArtifactStatus(
  current: ArtifactStatusesByMessageId,
  status: RuntimeArtifactStatus
): ArtifactStatusesByMessageId {
  const existingStatuses = current[status.messageId] ?? [];
  const statusKey = runtimeArtifactStatusKey(status);
  const nextStatuses = [
    ...existingStatuses.filter(
      (existingStatus) => runtimeArtifactStatusKey(existingStatus) !== statusKey
    ),
    status
  ];

  return {
    ...current,
    [status.messageId]: nextStatuses
  };
}

function runtimeArtifactStatusKey(status: RuntimeArtifactStatus): string {
  return `${status.type}:${status.title}`;
}
