"use client";

import type { Artifact } from "@agenthub/contracts";

import { buildArtifactFileUrl } from "../artifacts/artifact-links";

type MessageImageViewProps = {
  artifact: Artifact;
  scanStatus?: "clean" | "rejected" | "pending";
};

const safeMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml"
]);

export function MessageImageView({ artifact, scanStatus = "clean" }: MessageImageViewProps) {
  const mimeOk = safeMimeTypes.has(artifact.mimeType);
  const imageHref = getImageHref(artifact);
  const downloadHref = getDownloadHref(artifact);

  if (scanStatus === "rejected") {
    return (
      <figure data-testid="message-image-view" data-artifact-id={artifact.id}>
        <p role="alert">Attachment was blocked by the content scanner.</p>
      </figure>
    );
  }

  if (!mimeOk || scanStatus === "pending" || !imageHref) {
    return (
      <figure data-testid="message-image-view" data-artifact-id={artifact.id}>
        <a href={downloadHref} download={artifact.title}>
          Download {artifact.title}
        </a>
      </figure>
    );
  }

  return (
    <figure data-testid="message-image-view" data-artifact-id={artifact.id}>
      <img alt={artifact.title} src={imageHref} />
      <figcaption>{artifact.title}</figcaption>
    </figure>
  );
}

function getImageHref(artifact: Artifact): string | null {
  if (artifact.storageKey) {
    return buildArtifactFileUrl(artifact.id, artifact.workspaceId, "inline");
  }

  return artifact.previewUrl ?? null;
}

function getDownloadHref(artifact: Artifact): string {
  if (artifact.storageKey) {
    return buildArtifactFileUrl(artifact.id, artifact.workspaceId, "attachment");
  }

  return artifact.previewUrl ?? "#";
}
