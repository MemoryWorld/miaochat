"use client";

import type { Artifact } from "@agenthub/contracts";

type MessageFileViewProps = {
  artifact: Artifact;
  scanStatus?: "clean" | "rejected" | "pending";
};

const inlineMimeAllowList = new Set([
  "text/plain",
  "text/markdown",
  "application/json"
]);

export function MessageFileView({ artifact, scanStatus = "clean" }: MessageFileViewProps) {
  if (scanStatus === "rejected") {
    return (
      <div data-testid="message-file-view" data-artifact-id={artifact.id}>
        <p role="alert">Attachment was blocked by the content scanner.</p>
      </div>
    );
  }

  const inlineEligible =
    scanStatus === "clean" && inlineMimeAllowList.has(artifact.mimeType);

  return (
    <div data-testid="message-file-view" data-artifact-id={artifact.id}>
      <strong>{artifact.title}</strong>
      <span> · {artifact.mimeType}</span>
      {inlineEligible && artifact.previewUrl ? (
        <a href={artifact.previewUrl}>View inline</a>
      ) : (
        <a href={artifact.previewUrl ?? "#"} download={artifact.title}>
          Download
        </a>
      )}
    </div>
  );
}
