"use client";

import type { Artifact } from "@agenthub/contracts";

import {
  buildArtifactFileUrl,
  buildArtifactViewerUrl
} from "../artifacts/artifact-links";

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
  const inlineHref = getInlineHref(artifact);
  const downloadHref = getDownloadHref(artifact);

  return (
    <div data-testid="message-file-view" data-artifact-id={artifact.id}>
      <strong>{artifact.title}</strong>
      <span> · {artifact.mimeType}</span>
      {inlineEligible && inlineHref ? (
        <a href={inlineHref}>View inline</a>
      ) : (
        <a href={downloadHref} download={artifact.title}>
          Download
        </a>
      )}
    </div>
  );
}

function getInlineHref(artifact: Artifact): string | null {
  if (artifact.storageKey) {
    return isMarkdownArtifact(artifact)
      ? buildArtifactViewerUrl(artifact.id, artifact.workspaceId)
      : buildArtifactFileUrl(artifact.id, artifact.workspaceId, "inline");
  }

  return artifact.previewUrl ?? null;
}

function getDownloadHref(artifact: Artifact): string {
  if (artifact.storageKey) {
    return buildArtifactFileUrl(artifact.id, artifact.workspaceId, "attachment");
  }

  return artifact.previewUrl ?? "#";
}

function isMarkdownArtifact(artifact: Artifact): boolean {
  return artifact.mimeType.toLowerCase().includes("markdown");
}
