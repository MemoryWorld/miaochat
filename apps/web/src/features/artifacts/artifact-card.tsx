"use client";

import type { Artifact } from "@agenthub/contracts";

import { DiffCard } from "./diff-card";
import { PreviewCard } from "./preview-card";

type ArtifactCardProps = {
  artifact: Artifact;
};

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  if (artifact.kind === "diff") {
    return <DiffCard artifact={artifact} />;
  }

  if (artifact.kind === "image" || artifact.kind === "preview") {
    return <PreviewCard artifact={artifact} />;
  }

  return <AttachmentCard artifact={artifact} />;
}

type AttachmentCardProps = {
  artifact: Artifact;
};

function AttachmentCard({ artifact }: AttachmentCardProps) {
  return (
    <article
      aria-label={`Attachment artifact ${artifact.title}`}
      data-artifact-card="attachment"
      data-artifact-kind={artifact.kind}
      id={`artifact-${artifact.id}`}
      style={cardStyle}
    >
      <header style={headerStyle}>
        <span style={kindBadgeStyle}>Attachment</span>
        <strong style={titleStyle}>{artifact.title}</strong>
      </header>
      <div style={metaStyle}>
        <span>{artifact.mimeType}</span>
        {artifact.storageKey ? (
          <code data-artifact-storage-key style={storageKeyStyle}>
            {artifact.storageKey}
          </code>
        ) : null}
      </div>
    </article>
  );
}

const cardStyle = {
  background: "rgba(243, 244, 246, 0.95)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: "16px",
  display: "grid",
  gap: "0.45rem",
  padding: "0.85rem 1rem"
} as const;

const headerStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.55rem"
} as const;

const titleStyle = {
  color: "#101828",
  fontSize: "0.95rem"
} as const;

const kindBadgeStyle = {
  background: "rgba(15, 23, 42, 0.08)",
  borderRadius: "999px",
  color: "#344054",
  fontSize: "0.74rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  padding: "0.2rem 0.55rem",
  textTransform: "uppercase"
} as const;

const metaStyle = {
  alignItems: "center",
  color: "#475467",
  display: "flex",
  flexWrap: "wrap",
  fontSize: "0.82rem",
  gap: "0.5rem"
} as const;

const storageKeyStyle = {
  background: "rgba(15, 23, 42, 0.06)",
  borderRadius: "8px",
  fontFamily: "monospace",
  overflowWrap: "anywhere",
  padding: "0.15rem 0.45rem"
} as const;
