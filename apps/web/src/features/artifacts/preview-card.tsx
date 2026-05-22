"use client";

import type { Artifact } from "@agenthub/contracts";

type PreviewCardProps = {
  artifact: Artifact;
};

export function PreviewCard({ artifact }: PreviewCardProps) {
  return (
    <article
      aria-label={`Preview artifact ${artifact.title}`}
      data-artifact-card="preview"
      data-artifact-kind={artifact.kind}
      id={`artifact-${artifact.id}`}
      style={cardStyle}
    >
      <header style={headerStyle}>
        <span style={kindBadgeStyle("preview")}>
          {artifact.kind === "image" ? "Image preview" : "Preview"}
        </span>
        <strong style={titleStyle}>{artifact.title}</strong>
      </header>
      {artifact.previewUrl ? (
        <a
          aria-label={`Open the ${artifact.title} preview in a new tab`}
          data-artifact-preview-url
          href={artifact.previewUrl}
          rel="noreferrer"
          style={previewLinkStyle}
          target="_blank"
        >
          {artifact.previewUrl}
        </a>
      ) : (
        <p style={fallbackStyle}>
          Preview content is being generated and will be available once the storage
          target completes processing.
        </p>
      )}
      <footer style={footerStyle}>{artifact.mimeType}</footer>
    </article>
  );
}

const cardStyle = {
  background: "rgba(248, 250, 252, 0.9)",
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

const previewLinkStyle = {
  color: "#175cd3",
  fontSize: "0.86rem",
  overflowWrap: "anywhere",
  textDecoration: "none"
} as const;

const fallbackStyle = {
  color: "#475467",
  fontSize: "0.86rem",
  margin: 0
} as const;

const footerStyle = {
  color: "#667085",
  fontSize: "0.78rem"
} as const;

function kindBadgeStyle(tone: "preview"): { [key: string]: string } {
  return {
    background:
      tone === "preview" ? "rgba(11, 110, 255, 0.12)" : "rgba(15, 23, 42, 0.06)",
    borderRadius: "999px",
    color: tone === "preview" ? "#175cd3" : "#344054",
    fontSize: "0.74rem",
    fontWeight: "700",
    letterSpacing: "0.02em",
    padding: "0.2rem 0.55rem",
    textTransform: "uppercase"
  };
}
