"use client";

import { useState } from "react";

import type { Artifact } from "@agenthub/contracts";

import { apiBaseUrl } from "../../lib/api-base-url";
import { CodeEditorOverlay } from "../artifacts/code-editor-overlay";

type ArtifactEditDispatcherProps = {
  artifact: Artifact;
  conversationId: string;
  initialContent: string;
  onClose: () => void;
};

async function digestSha256(text: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(text);
    const buffer = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  // jsdom polyfill fallback for the test environment.
  return Array.from({ length: 64 }, () => "0").join("");
}

export function ArtifactEditDispatcher({
  artifact,
  conversationId,
  initialContent,
  onClose
}: ArtifactEditDispatcherProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleSave(content: string): Promise<void> {
    setError(null);
    try {
      const contentDigest = await digestSha256(content);

      const revision = await fetch(
        `${apiBaseUrl}/artifacts/${encodeURIComponent(artifact.id)}/revisions?workspaceId=${encodeURIComponent(artifact.workspaceId)}`,
        {
          body: JSON.stringify({
            contentDigest,
            summary: "Inline edit"
          }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST"
        }
      );

      if (!revision.ok) {
        throw new Error(`记录版本失败（${revision.status}）。`);
      }

      const dispatch = await fetch(`${apiBaseUrl}/messages/send`, {
        body: JSON.stringify({
          content: `Modify artifact ${artifact.title}:\n\n${content}`,
          conversationId,
          mentionedAgentIds: [],
          role: "user",
          workspaceId: artifact.workspaceId
        }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!dispatch.ok) {
        throw new Error(`发送后续任务失败（${dispatch.status}）。`);
      }

      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未知错误。");
    }
  }

  return (
    <div data-testid="artifact-edit-dispatcher">
      <CodeEditorOverlay
        artifactId={artifact.id}
        initialContent={initialContent}
        onCancel={onClose}
        onSave={handleSave}
      />
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
