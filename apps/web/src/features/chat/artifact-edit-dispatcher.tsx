"use client";

import { useState } from "react";

import { messageAttachmentInputMaxContentChars, type Artifact } from "@agenthub/contracts";

import { apiBaseUrl } from "../../lib/api-base-url";
import {
  CodeEditorOverlay,
  type SelectionEditRequest
} from "../artifacts/code-editor-overlay";
import { digestSha256 } from "../artifacts/digest";

const selectionQuoteMaxChars = 4000;

type ArtifactEditDispatcherProps = {
  artifact: Artifact;
  conversationId: string;
  initialContent: string;
  onClose: () => void;
};

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

  async function handleSelectionEdit(request: SelectionEditRequest): Promise<void> {
    setError(null);
    try {
      if (initialContent.length > messageAttachmentInputMaxContentChars) {
        throw new Error("产物内容超过 64KB，选区修改暂不可用，请使用完整编辑模式。");
      }

      const quotedSelection =
        request.selection.length > selectionQuoteMaxChars
          ? `${request.selection.slice(0, selectionQuoteMaxChars)}\n…（选区过长已截断，完整内容见附件）`
          : request.selection;
      const lineRange =
        request.selectionStartLine === request.selectionEndLine
          ? `第 ${request.selectionStartLine} 行`
          : `第 ${request.selectionStartLine}–${request.selectionEndLine} 行`;
      const content = [
        `请修改产物「${artifact.title}」的选中片段（${lineRange}）：`,
        "",
        "````",
        quotedSelection,
        "````",
        "",
        `修改要求：${request.instruction}`,
        "",
        "附件是该产物的完整当前内容：请只按要求修改选中片段、保持其余内容不变，并通过对应的产物工具输出修改后的完整文件。"
      ].join("\n");

      const dispatch = await fetch(`${apiBaseUrl}/messages/send`, {
        body: JSON.stringify({
          attachments: [
            {
              content: initialContent,
              fileName: attachmentFileNameFromArtifact(artifact),
              mimeType: artifact.mimeType
            }
          ],
          content,
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
        throw new Error(`发送修改请求失败（${dispatch.status}）。`);
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
        error={error}
        initialContent={initialContent}
        language={languageFromArtifact(artifact)}
        onCancel={onClose}
        onDispatchSelectionEdit={handleSelectionEdit}
        onSave={handleSave}
        title={artifact.title}
      />
    </div>
  );
}

function attachmentFileNameFromArtifact(artifact: Artifact): string {
  if (/\.[a-z0-9]{1,8}$/i.test(artifact.title)) {
    return artifact.title;
  }

  const language = languageFromArtifact(artifact);
  const extension =
    language === "markdown"
      ? ".md"
      : language === "json"
        ? ".json"
        : language === "diff"
          ? ".diff"
          : language === "html"
            ? ".html"
            : ".txt";

  return `${artifact.title}${extension}`;
}

function languageFromArtifact(artifact: Artifact): string {
  const mimeType = artifact.mimeType.toLowerCase();
  const title = artifact.title.toLowerCase();

  if (mimeType.includes("markdown") || title.endsWith(".md")) {
    return "markdown";
  }

  if (mimeType.includes("json") || title.endsWith(".json")) {
    return "json";
  }

  if (artifact.kind === "diff" || mimeType.includes("diff") || title.endsWith(".diff")) {
    return "diff";
  }

  if (mimeType.includes("html") || title.endsWith(".html")) {
    return "html";
  }

  return "plaintext";
}
