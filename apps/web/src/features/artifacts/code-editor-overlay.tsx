"use client";

import { useState } from "react";

type CodeEditorOverlayProps = {
  artifactId: string;
  initialContent: string;
  language?: string;
  onCancel: () => void;
  onSave: (content: string) => void | Promise<void>;
};

/**
 * Lightweight stand-in for a full code editor (Monaco / Codemirror) that the
 * upcoming UI baseline will replace. The component intentionally exposes the
 * minimum surface required by the artifact follow-up edit flow: a textarea
 * that captures the new content and a save button that hands it off to the
 * dispatcher.
 */
export function CodeEditorOverlay({
  artifactId,
  initialContent,
  language,
  onCancel,
  onSave
}: CodeEditorOverlayProps) {
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);

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
      role="dialog"
      aria-label="Code editor"
      data-artifact-id={artifactId}
      data-language={language ?? "plaintext"}
    >
      <textarea
        aria-label="Code editor content"
        spellCheck={false}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={20}
      />
      <button type="button" onClick={() => void handleSave()} disabled={busy}>
        {busy ? "Saving…" : "Save and dispatch"}
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
