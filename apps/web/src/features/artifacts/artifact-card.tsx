"use client";

import { useEffect, useState, type CSSProperties } from "react";

import type { Artifact } from "@agenthub/contracts";

import { ArtifactEditDispatcher } from "../chat/artifact-edit-dispatcher";
import { MarkdownContent } from "../chat/markdown-content";
import {
  buildArtifactContentUrl,
  buildArtifactFileUrl,
  buildArtifactViewerUrl
} from "./artifact-links";

type ArtifactCardProps = {
  artifact: Artifact;
  conversationId?: string;
};

type PreviewStatus = "idle" | "loading" | "ready" | "error";

export function ArtifactCard({ artifact, conversationId }: ArtifactCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);

  const cardType = getCardType(artifact);
  const isImage = isImageArtifact(artifact);
  const imagePreviewUrl = isImage ? getArtifactInlineHref(artifact) : null;
  const canLoadTextPreview = isTextPreviewArtifact(artifact) && Boolean(
    artifact.previewUrl || artifact.storageKey
  );
  const canEmbedPreview = Boolean(
    artifact.previewUrl &&
    !artifact.storageKey &&
    !isImage &&
    !canLoadTextPreview &&
    artifact.kind === "preview"
  );

  useEffect(() => {
    const previewSource = resolveTextPreviewSource(artifact);

    if (!expanded || !previewSource || !canLoadTextPreview || previewText !== null) {
      return;
    }

    const controller = new AbortController();
    setPreviewStatus("loading");
    setPreviewError(null);

    fetch(previewSource.url, {
      ...(previewSource.requiresCredentials ? { credentials: "include" as const } : {}),
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`预览加载失败（${response.status}）。`);
        }
        return previewSource.kind === "artifact-content"
          ? readArtifactContentPreview(response)
          : readPreviewText(response);
      })
      .then((text) => {
        setPreviewText(text);
        setPreviewStatus("ready");
      })
      .catch((cause) => {
        if (controller.signal.aborted) {
          return;
        }
        setPreviewStatus("error");
        setPreviewError(cause instanceof Error ? cause.message : "预览加载失败。");
      });

    return () => controller.abort();
  }, [artifact, canLoadTextPreview, expanded, previewText]);

  const visiblePreviewText = previewText ?? "";

  const canEditThroughChat = Boolean(conversationId && previewText && canLoadTextPreview);

  return (
    <article
      aria-label={`${getCardLabel(cardType)} artifact ${artifact.title}`}
      data-artifact-card={cardType}
      data-artifact-kind={artifact.kind}
      id={`artifact-${artifact.id}`}
      style={cardStyle}
    >
      <header style={headerStyle}>
        <span style={kindBadgeStyle(cardType)}>{getBadgeLabel(artifact, cardType)}</span>
        <strong style={titleStyle}>{artifact.title}</strong>
        <span style={mimeStyle}>{artifact.mimeType}</span>
      </header>

      <div style={summaryStyle}>
        {imagePreviewUrl ? (
          <img
            alt={`${artifact.title} preview`}
            data-artifact-image-preview
            src={imagePreviewUrl}
            style={thumbnailStyle}
          />
        ) : null}
        {artifact.previewUrl || artifact.storageKey ? renderPreviewLink({
          artifact,
          cardType
        }) : null}
        {!artifact.previewUrl && !artifact.storageKey ? (
          <p style={emptyStateStyle}>Preview content is still being prepared.</p>
        ) : null}
        {artifact.kind === "diff" ? (
          <p style={emptyStateStyle}>Baseline diff card: open the artifact preview to inspect the change.</p>
        ) : null}
      </div>

      <div style={actionRowStyle}>
        <button
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${artifact.title} artifact workbench` : `Open ${artifact.title} artifact workbench`}
          onClick={() => {
            setExpanded((value) => !value);
            if (editing) {
              setEditing(false);
            }
          }}
          style={secondaryButtonStyle}
          type="button"
        >
          {expanded ? "收起预览" : "展开预览"}
        </button>
        {canEditThroughChat ? (
          <button
            aria-label={`Edit ${artifact.title} through chat`}
            onClick={() => setEditing(true)}
            style={primaryButtonStyle}
            type="button"
          >
            对话修改
          </button>
        ) : null}
        {artifact.previewUrl || artifact.storageKey ? (
          <a
            aria-label={`下载 ${artifact.title}`}
            href={getArtifactDownloadHref(artifact)}
            rel="noreferrer"
            style={secondaryLinkStyle}
            target="_blank"
          >
            下载
          </a>
        ) : null}
      </div>

      {expanded ? (
        <section
          aria-label={`${artifact.title} artifact workbench`}
          data-artifact-workbench
          style={workbenchStyle}
        >
          {renderExpandedPreview({
            artifact,
            canEmbedPreview,
            canLoadTextPreview,
            isImage,
            previewError,
            previewStatus,
            visiblePreviewText
          })}
        </section>
      ) : null}

      {editing && conversationId && previewText ? (
        <ArtifactEditDispatcher
          artifact={artifact}
          conversationId={conversationId}
          initialContent={previewText}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </article>
  );
}

const previewTextLimit = 16000;
const previewTruncationNotice =
  "\n\n... preview truncated in the timeline; open the artifact for the full file.";

type TextPreviewSource = {
  kind: "artifact-content" | "preview-url";
  requiresCredentials: boolean;
  url: string;
};

function resolveTextPreviewSource(artifact: Artifact): TextPreviewSource | null {
  if (artifact.storageKey) {
    return {
      kind: "artifact-content",
      requiresCredentials: true,
      url: getArtifactContentUrl(artifact)
    };
  }

  if (!artifact.previewUrl) {
    return null;
  }

  return {
    kind: "preview-url",
    requiresCredentials: false,
    url: artifact.previewUrl
  };
}

async function readArtifactContentPreview(response: Response): Promise<string> {
  const payload = await response.json() as {
    content?: unknown;
    truncated?: unknown;
  };
  const content = typeof payload.content === "string" ? payload.content : "";

  return payload.truncated === true ? `${content}${previewTruncationNotice}` : content;
}

async function readPreviewText(response: Response): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    return truncatePreviewText(await response.text());
  }

  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    text += decoder.decode(value, { stream: true });

    if (text.length >= previewTextLimit) {
      text = text.slice(0, previewTextLimit);
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  if (!truncated) {
    text += decoder.decode();
  }

  return truncated ? `${text}${previewTruncationNotice}` : text;
}

function getArtifactContentUrl(artifact: Artifact): string {
  return buildArtifactContentUrl(artifact.id, artifact.workspaceId);
}

function truncatePreviewText(text: string): string {
  if (text.length <= previewTextLimit) {
    return text;
  }

  return `${text.slice(0, previewTextLimit)}${previewTruncationNotice}`;
}

type ExpandedPreviewInput = {
  artifact: Artifact;
  canEmbedPreview: boolean;
  canLoadTextPreview: boolean;
  isImage: boolean;
  previewError: string | null;
  previewStatus: PreviewStatus;
  visiblePreviewText: string;
};

function renderExpandedPreview({
  artifact,
  canEmbedPreview,
  canLoadTextPreview,
  isImage,
  previewError,
  previewStatus,
  visiblePreviewText
}: ExpandedPreviewInput) {
  const imagePreviewUrl = isImage ? getArtifactInlineHref(artifact) : null;

  if (imagePreviewUrl) {
    return (
      <img
        alt={`${artifact.title} full preview`}
        data-artifact-expanded-image
        src={imagePreviewUrl}
        style={expandedImageStyle}
      />
    );
  }

  if (canLoadTextPreview) {
    if (previewStatus === "loading") {
      return <p style={emptyStateStyle}>正在加载产物内容...</p>;
    }

    if (previewStatus === "error") {
      return <p role="alert" style={errorStyle}>{previewError}</p>;
    }

    if (visiblePreviewText) {
      return isMarkdownArtifact(artifact) ? (
        <div data-artifact-inline-preview style={markdownPreviewStyle}>
          <MarkdownContent content={visiblePreviewText} />
        </div>
      ) : isHtmlArtifact(artifact) ? (
        <iframe
          data-artifact-iframe-preview
          sandbox="allow-scripts"
          srcDoc={visiblePreviewText}
          style={iframeStyle}
          title={`${artifact.title} preview`}
        />
      ) : (
        <pre data-artifact-inline-preview style={codePreviewStyle}>
          {visiblePreviewText}
        </pre>
      );
    }

    return <p style={emptyStateStyle}>展开后会在这里显示文本预览。</p>;
  }

  if (canEmbedPreview && artifact.previewUrl) {
    return (
      <iframe
        data-artifact-iframe-preview
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-forms allow-popups allow-scripts"
        src={artifact.previewUrl}
        style={iframeStyle}
        title={`${artifact.title} preview`}
      />
    );
  }

  if (artifact.kind === "diff") {
    return <p style={emptyStateStyle}>Baseline diff card: open the artifact preview to inspect the change.</p>;
  }

  return <p style={emptyStateStyle}>No inline preview is available for this artifact yet.</p>;
}

type PreviewLinkInput = {
  artifact: Artifact;
  cardType: ArtifactCardType;
};

function renderPreviewLink({
  artifact,
  cardType
}: PreviewLinkInput) {
  if (artifact.storageKey) {
    if (isMarkdownArtifact(artifact)) {
      return (
        <a
          aria-label={`Open ${artifact.title} Markdown in a new tab`}
          data-artifact-preview-url
          href={buildArtifactViewerUrl(artifact.id, artifact.workspaceId)}
          rel="noreferrer"
          style={actionLinkStyle}
          target="_blank"
        >
          打开 Markdown
        </a>
      );
    }

    return (
      <a
        aria-label={`Open the ${artifact.title} preview in a new tab`}
        data-artifact-preview-url
        href={buildArtifactFileUrl(artifact.id, artifact.workspaceId, "inline")}
        rel="noreferrer"
        style={actionLinkStyle}
        target="_blank"
      >
        {isHtmlArtifact(artifact) ? "打开网页" : "打开产物"}
      </a>
    );
  }

  if (!artifact.previewUrl) {
    return null;
  }

  if (isMarkdownArtifact(artifact)) {
    return (
      <a
        aria-label={`Open ${artifact.title} Markdown in a new tab`}
        data-artifact-preview-url
        href={artifact.previewUrl}
        rel="noreferrer"
        style={actionLinkStyle}
        target="_blank"
      >
        打开 Markdown
      </a>
    );
  }

  return (
    <a
      aria-label={`Open the ${artifact.title} preview in a new tab`}
      data-artifact-preview-url
      href={artifact.previewUrl}
      rel="noreferrer"
      style={cardType === "preview" ? previewLinkStyle : actionLinkStyle}
      target="_blank"
    >
      {cardType === "preview" ? artifact.previewUrl : "打开产物"}
    </a>
  );
}

function getArtifactDownloadHref(artifact: Artifact): string {
  if (artifact.storageKey) {
    return buildArtifactFileUrl(artifact.id, artifact.workspaceId, "attachment");
  }

  return artifact.previewUrl ?? "#";
}

function getArtifactInlineHref(artifact: Artifact): string | null {
  if (artifact.storageKey) {
    return buildArtifactFileUrl(artifact.id, artifact.workspaceId, "inline");
  }

  return artifact.previewUrl ?? null;
}

type ArtifactCardType = "attachment" | "diff" | "preview";

function getCardType(artifact: Artifact): ArtifactCardType {
  if (artifact.kind === "diff") {
    return "diff";
  }

  if (artifact.kind === "image" || artifact.kind === "preview") {
    return "preview";
  }

  return "attachment";
}

function getCardLabel(cardType: ArtifactCardType): string {
  switch (cardType) {
    case "attachment":
      return "Attachment";
    case "diff":
      return "Diff";
    case "preview":
      return "Preview";
  }
}

function getBadgeLabel(artifact: Artifact, cardType: ArtifactCardType): string {
  if (artifact.kind === "image") {
    return "Image preview";
  }

  if (cardType === "diff") {
    return "Diff";
  }

  if (cardType === "attachment") {
    return "Attachment";
  }

  return "Preview";
}

function isImageArtifact(artifact: Artifact): boolean {
  const mimeType = artifact.mimeType.toLowerCase();
  return artifact.kind === "image" || mimeType.startsWith("image/");
}

function isTextPreviewArtifact(artifact: Artifact): boolean {
  const mimeType = artifact.mimeType.toLowerCase();

  if (artifact.kind === "diff") {
    return true;
  }

  if (mimeType.includes("markdown") || mimeType.includes("json")) {
    return true;
  }

  if (mimeType.includes("html")) {
    return true;
  }

  return mimeType.startsWith("text/");
}

function isMarkdownArtifact(artifact: Artifact): boolean {
  return artifact.mimeType.toLowerCase().includes("markdown");
}

function isHtmlArtifact(artifact: Artifact): boolean {
  return artifact.mimeType.toLowerCase().includes("html");
}

const cardStyle: CSSProperties = {
  background: "rgba(248, 250, 252, 0.94)",
  border: "1px solid rgba(15, 23, 42, 0.1)",
  borderRadius: "8px",
  display: "grid",
  gap: "0.55rem",
  padding: "0.85rem 1rem"
};

const headerStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.55rem"
};

const titleStyle: CSSProperties = {
  color: "#101828",
  fontSize: "0.95rem",
  fontWeight: 800,
  lineHeight: 1.35
};

const mimeStyle: CSSProperties = {
  color: "#667085",
  fontSize: "0.78rem"
};

function kindBadgeStyle(cardType: ArtifactCardType): CSSProperties {
  const palette: Record<ArtifactCardType, { background: string; color: string }> = {
    attachment: { background: "rgba(71, 84, 103, 0.12)", color: "#344054" },
    diff: { background: "rgba(220, 104, 3, 0.12)", color: "#b54708" },
    preview: { background: "rgba(11, 110, 255, 0.12)", color: "#175cd3" }
  };

  return {
    background: palette[cardType].background,
    borderRadius: "999px",
    color: palette[cardType].color,
    fontSize: "0.74rem",
    fontWeight: 800,
    letterSpacing: "0.02em",
    padding: "0.2rem 0.55rem",
    textTransform: "uppercase"
  };
}

const summaryStyle: CSSProperties = {
  alignItems: "start",
  color: "#475467",
  display: "grid",
  gap: "0.45rem",
  fontSize: "0.84rem"
};

const actionRowStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem"
};

const actionLinkStyle: CSSProperties = {
  color: "#175cd3",
  fontSize: "0.86rem",
  fontWeight: 700,
  textDecoration: "none"
};

const previewLinkStyle: CSSProperties = {
  ...actionLinkStyle,
  fontWeight: 600,
  overflowWrap: "anywhere"
};

const primaryButtonStyle: CSSProperties = {
  background: "#101828",
  border: "1px solid #101828",
  borderRadius: "8px",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 800,
  padding: "0.4rem 0.65rem"
};

const secondaryButtonStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  borderRadius: "8px",
  color: "#344054",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 800,
  padding: "0.4rem 0.65rem"
};

const secondaryLinkStyle: CSSProperties = {
  ...secondaryButtonStyle,
  display: "inline-flex",
  textDecoration: "none"
};

const thumbnailStyle: CSSProperties = {
  aspectRatio: "16 / 9",
  background: "#eef2f6",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: "8px",
  maxHeight: "180px",
  objectFit: "cover",
  width: "100%"
};

const workbenchStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.1)",
  borderRadius: "8px",
  overflow: "hidden"
};

const codePreviewStyle: CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.78rem",
  lineHeight: 1.65,
  margin: 0,
  maxHeight: "420px",
  overflow: "auto",
  padding: "0.85rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};

const markdownPreviewStyle: CSSProperties = {
  maxHeight: "520px",
  overflow: "auto",
  padding: "0.85rem"
};

const iframeStyle: CSSProperties = {
  border: 0,
  height: "360px",
  width: "100%"
};

const expandedImageStyle: CSSProperties = {
  background: "#eef2f6",
  display: "block",
  maxHeight: "460px",
  objectFit: "contain",
  width: "100%"
};

const emptyStateStyle: CSSProperties = {
  color: "#475467",
  fontSize: "0.84rem",
  margin: 0,
  padding: "0.75rem"
};

const errorStyle: CSSProperties = {
  background: "rgba(254, 243, 242, 0.95)",
  color: "#b42318",
  fontSize: "0.84rem",
  fontWeight: 700,
  margin: 0,
  padding: "0.75rem"
};
