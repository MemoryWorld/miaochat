"use client";

import { useMemo, useState, type CSSProperties } from "react";

export type SelectionEditRequest = {
  instruction: string;
  selection: string;
  selectionEndLine: number;
  selectionStartLine: number;
};

type CodeEditorOverlayProps = {
  artifactId: string;
  error?: string | null;
  initialContent: string;
  language?: string;
  onCancel: () => void;
  onDispatchSelectionEdit?: (input: SelectionEditRequest) => void | Promise<void>;
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
  onDispatchSelectionEdit,
  onSave,
  title
}: CodeEditorOverlayProps) {
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ end: number; start: number } | null>(null);
  const [instruction, setInstruction] = useState("");
  const [selectionBusy, setSelectionBusy] = useState(false);

  const metrics = useMemo(() => {
    const lineCount = content.length === 0 ? 1 : content.split("\n").length;
    return `${lineCount} lines / ${content.length} chars`;
  }, [content]);

  const selectionInfo = useMemo(() => {
    if (!selectionRange) {
      return null;
    }

    const start = Math.min(selectionRange.start, content.length);
    const end = Math.min(selectionRange.end, content.length);

    if (start >= end) {
      return null;
    }

    return {
      selection: content.slice(start, end),
      selectionEndLine: content.slice(0, end).replace(/\n$/, "").split("\n").length,
      selectionStartLine: content.slice(0, start).split("\n").length
    };
  }, [content, selectionRange]);

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await onSave(content);
    } finally {
      setBusy(false);
    }
  }

  async function handleDispatchSelectionEdit(): Promise<void> {
    if (!onDispatchSelectionEdit || !selectionInfo || !instruction.trim()) {
      return;
    }

    setSelectionBusy(true);
    try {
      await onDispatchSelectionEdit({
        instruction: instruction.trim(),
        ...selectionInfo
      });
    } finally {
      setSelectionBusy(false);
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
        onSelect={(event) => {
          const target = event.currentTarget;
          setSelectionRange(
            target.selectionStart === target.selectionEnd
              ? null
              : { end: target.selectionEnd, start: target.selectionStart }
          );
        }}
        spellCheck={false}
        style={textareaStyle}
        value={content}
      />

      {onDispatchSelectionEdit && !selectionInfo ? (
        <p style={selectionHintStyle}>
          在上方代码中选中片段，可直接描述修改交给 AI 同事处理。
        </p>
      ) : null}

      {onDispatchSelectionEdit && selectionInfo ? (
        <section aria-label="选区修改" data-selection-edit style={selectionPanelStyle}>
          <span style={selectionMetaStyle}>
            已选中第 {selectionInfo.selectionStartLine}–{selectionInfo.selectionEndLine} 行（{selectionInfo.selection.length} 字符）
          </span>
          <textarea
            aria-label="描述要对选中片段做的修改"
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="例如：把这一段的配色换成深色主题"
            style={instructionInputStyle}
            value={instruction}
          />
          <div style={selectionActionsStyle}>
            <button
              disabled={selectionBusy || instruction.trim().length === 0}
              onClick={() => void handleDispatchSelectionEdit()}
              style={
                selectionBusy || instruction.trim().length === 0
                  ? disabledButtonStyle
                  : primaryButtonStyle
              }
              type="button"
            >
              {selectionBusy ? "发送中..." : "发送修改请求"}
            </button>
          </div>
        </section>
      ) : null}

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

const selectionHintStyle: CSSProperties = {
  color: "#667085",
  fontSize: "0.78rem",
  margin: 0
};

const selectionPanelStyle: CSSProperties = {
  background: "rgba(240, 247, 255, 0.85)",
  border: "1px solid rgba(0, 122, 255, 0.25)",
  borderRadius: "8px",
  display: "grid",
  gap: "0.5rem",
  padding: "0.6rem 0.7rem"
};

const selectionMetaStyle: CSSProperties = {
  color: "#175cd3",
  fontSize: "0.78rem",
  fontWeight: 800
};

const instructionInputStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.14)",
  borderRadius: "8px",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: "0.84rem",
  lineHeight: 1.5,
  minHeight: "60px",
  outline: "none",
  padding: "0.5rem 0.6rem",
  resize: "vertical",
  width: "100%"
};

const selectionActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end"
};
