"use client";

import type { Artifact } from "@agenthub/contracts";

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

  if (scanStatus === "rejected") {
    return (
      <figure data-testid="message-image-view" data-artifact-id={artifact.id}>
        <p role="alert">Attachment was blocked by the content scanner.</p>
      </figure>
    );
  }

  if (!mimeOk || scanStatus === "pending" || !artifact.previewUrl) {
    return (
      <figure data-testid="message-image-view" data-artifact-id={artifact.id}>
        <a href={artifact.previewUrl ?? "#"} download={artifact.title}>
          Download {artifact.title}
        </a>
      </figure>
    );
  }

  return (
    <figure data-testid="message-image-view" data-artifact-id={artifact.id}>
      <img alt={artifact.title} src={artifact.previewUrl} />
      <figcaption>{artifact.title}</figcaption>
    </figure>
  );
}
