"use client";

import { useMemo, useState, type CSSProperties } from "react";

type CodeEditorOverlayProps = {
  artifactId: string;
  error?: string | null;
  initialContent: string;
  language?: string;
  onCancel: () => void;
  onSave: (content: string) => void | Promise<void>;
  title?: string;
};

/**
 * Focused artifact editor used by the conversational follow-up flow. It keeps
 * the persistence and agent dispatch logic outside the editor so this panel can
 * later be swapped for Monaco / CodeMirror without changing the workflow.
 */
export function CodeEditorOverlay({
  artifactId,
  error,
  initialContent,
  language,
  onCancel,
  onSave,
  title
}: CodeEditorOverlayProps) {
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);

  const metrics = useMemo(() => {
    const lineCount = content.length === 0 ? 1 : content.split("\n").length;
    return `${lineCount} lines / ${content.length} chars`;
  }, [content]);

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await onSave(content);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-label={title ? `Code editor for ${title}` : "Code editor"}
      data-artifact-id={artifactId}
      data-language={language ?? "plaintext"}
      role="dialog"
      style={overlayStyle}
    >
      <header style={headerStyle}>
        <div style={titleGroupStyle}>
          <span style={languageBadgeStyle}>{language ?? "plaintext"}</span>
          <strong style={titleStyle}>{title ?? "Artifact edit"}</strong>
        </div>
        <span aria-live="polite" style={metricsStyle}>{metrics}</span>
      </header>

      <textarea
        aria-label="Code editor content"
        onChange={(event) => setContent(event.target.value)}
        spellCheck={false}
        style={textareaStyle}
        value={content}
      />

      {error ? <p role="alert" style={errorStyle}>{error}</p> : null}

      <footer style={footerStyle}>
        <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={() => void handleSave()}
          style={busy ? disabledButtonStyle : primaryButtonStyle}
          type="button"
        >
          {busy ? "Saving..." : "Save and dispatch"}
        </button>
      </footer>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: "8px",
  display: "grid",
  gap: "0.65rem",
  padding: "0.75rem"
};

const headerStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
  justifyContent: "space-between"
};

const titleGroupStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  minWidth: 0
};

const languageBadgeStyle: CSSProperties = {
  background: "rgba(15, 23, 42, 0.08)",
  borderRadius: "999px",
  color: "#344054",
  fontSize: "0.72rem",
  fontWeight: 800,
  padding: "0.18rem 0.5rem",
  textTransform: "uppercase"
};

const titleStyle: CSSProperties = {
  color: "#101828",
  fontSize: "0.9rem",
  lineHeight: 1.35,
  overflowWrap: "anywhere"
};

const metricsStyle: CSSProperties = {
  color: "#667085",
  fontSize: "0.76rem",
  fontWeight: 700
};

const textareaStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(15, 23, 42, 0.18)",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#e2e8f0",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.82rem",
  lineHeight: 1.65,
  minHeight: "320px",
  outline: "none",
  padding: "0.85rem",
  resize: "vertical",
  width: "100%"
};

const footerStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  justifyContent: "flex-end"
};

const primaryButtonStyle: CSSProperties = {
  background: "#101828",
  border: "1px solid #101828",
  borderRadius: "8px",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 800,
  padding: "0.48rem 0.75rem"
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  cursor: "not-allowed",
  opacity: 0.7
};

const secondaryButtonStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  borderRadius: "8px",
  color: "#344054",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 800,
  padding: "0.48rem 0.75rem"
};

const errorStyle: CSSProperties = {
  background: "rgba(254, 243, 242, 0.95)",
  border: "1px solid rgba(240, 68, 56, 0.25)",
  borderRadius: "8px",
  color: "#b42318",
  fontSize: "0.82rem",
  fontWeight: 700,
  margin: 0,
  padding: "0.55rem 0.65rem"
};
