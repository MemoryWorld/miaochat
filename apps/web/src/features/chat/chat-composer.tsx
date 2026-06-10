"use client";

import { useEffect, useId, useState } from "react";

import type { ChannelMember, ConversationAgentMember } from "@agenthub/contracts";

import { MemberMentionInput, buildMentionLabel } from "./member-mention-input";

type ChatSendInput = {
  attachments: File[];
  content: string;
  mentionedAgentIds: string[];
  mentionedUserIds: string[];
};

type ChatComposerProps = {
  disabled?: boolean;
  disabledReason?: string | null;
  draftContent?: string | null;
  members?: ChannelMember[];
  onDraftApplied?: () => void;
  onSend: (input: ChatSendInput) => Promise<boolean | void>;
  onTyping?: () => void;
  participants?: ConversationAgentMember[];
  submitDisabled?: boolean;
};

export function ChatComposer({
  disabled = false,
  disabledReason = null,
  draftContent = null,
  members,
  onDraftApplied,
  onSend,
  onTyping,
  participants = [],
  submitDisabled = false
}: ChatComposerProps) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const fileInputId = useId();
  const disabledReasonId = useId();
  const mentionMembers = members ?? participants.map(mapParticipantToMember);
  const mentionableMembers = mentionMembers.filter(isMentionableMember);
  const showActionSuggestions = content.trimStart().startsWith("/");
  const isSubmitBlocked = disabled || submitDisabled;
  const showDisabledReason = Boolean(disabledReason && isSubmitBlocked);
  const isSendButtonDisabled = isSubmitBlocked || content.trim().length === 0;

  useEffect(() => {
    if (draftContent === null) {
      return;
    }

    setContent(draftContent);
    setSelectedMemberIds([]);
    onDraftApplied?.();
  }, [draftContent, onDraftApplied]);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        const trimmed = content.trim();

        if (!trimmed || isSubmitBlocked) {
          return;
        }

        const mentionedMemberIds = resolveMentionedMemberIds(
          trimmed,
          mentionableMembers,
          selectedMemberIds
        );

        const didSend = await onSend({
          attachments,
          content: trimmed,
          mentionedAgentIds: mentionedMemberIds.flatMap((memberId) =>
            memberId.startsWith("ai:") ? [memberId.slice("ai:".length)] : []
          ),
          mentionedUserIds: mentionedMemberIds.flatMap((memberId) =>
            memberId.startsWith("human:") && !memberId.startsWith("human:pending:")
              ? [memberId.slice("human:".length)]
              : []
          )
        });
        if (didSend === false) {
          return;
        }
        setContent("");
        setAttachments([]);
        setSelectedMemberIds([]);
      }}
      style={{
        borderTop: "1px solid rgba(15, 23, 42, 0.08)",
        display: "grid",
        gap: "0.75rem",
        marginTop: "1rem",
        paddingTop: "1rem"
      }}
    >
      <MemberMentionInput
        disabled={disabled}
        members={mentionableMembers}
        onToggleMember={(member) => {
          setSelectedMemberIds((current) =>
            current.includes(member.memberId)
              ? current.filter((memberId) => memberId !== member.memberId)
              : [...current, member.memberId]
          );
          setContent((current) =>
            current.includes(buildMentionLabel(member.displayName))
              ? current
              : appendMentionLabel(current, buildMentionLabel(member.displayName))
          );
        }}
        selectedMemberIds={selectedMemberIds}
      />
      <label
        htmlFor="chat-composer-input"
        style={{
          color: "#344054",
          display: "grid",
          fontSize: "0.95rem",
          fontWeight: 600,
          gap: "0.4rem"
        }}
      >
        消息内容
        <textarea
          id="chat-composer-input"
          disabled={disabled}
          onChange={(event) => {
            setContent(event.target.value);
            onTyping?.();
          }}
          placeholder="输入任务，或 @ 指定 Agent。比如：用 Codex 做一个 React 组件。"
          rows={3}
          value={content}
          style={{
            border: "1px solid rgba(15, 23, 42, 0.12)",
            borderRadius: "16px",
            font: "inherit",
            padding: "0.9rem 1rem",
            resize: "vertical"
          }}
        />
      </label>
      {showActionSuggestions ? (
        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">快捷动作</div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "制作网页", value: "请制作一个响应式单文件 HTML 网页，并生成可下载产物。" },
              { label: "创建 Workflow", value: "请创建一个可视化 workflow，先展示节点预览和输入输出，等待我执行。" },
              { label: "修改产物", value: "请基于当前最新产物继续修改，并说明变更点。" },
              { label: "部署状态", value: "请检查当前网页产物是否可以部署，并给出部署状态。" }
            ].map((action) => (
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                key={action.label}
                onClick={() => {
                  setContent(action.value);
                }}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        <span className="text-sm font-semibold text-slate-600">附件</span>
        <label
          className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          htmlFor={fileInputId}
        >
          <span>选择文件</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {attachments.length > 0 ? `${attachments.length} 个文件` : "支持多选"}
          </span>
        </label>
        <input
          accept=".txt,.md,.markdown,.json,.xml,.yaml,.yml,.js,.jsx,.mjs,.cjs,.ts,.tsx,.css,.html,.htm,.csv,.diff,.patch,text/*,application/json,application/xml,application/javascript,application/typescript,application/yaml"
          aria-label="选择文件"
          className="sr-only"
          disabled={disabled}
          id={fileInputId}
          multiple
          onChange={(event) => {
            setAttachments(Array.from(event.target.files ?? []));
          }}
          type="file"
        />
      </div>
      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((file) => (
            <span
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600"
              key={`${file.name}:${file.size}:${file.lastModified}`}
            >
              {file.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="grid gap-2">
        {showDisabledReason ? (
          <p
            className="m-0 text-sm font-medium text-amber-700"
            id={disabledReasonId}
            role="status"
          >
            {disabledReason}
          </p>
        ) : null}
        <button
          aria-describedby={showDisabledReason ? disabledReasonId : undefined}
          disabled={isSendButtonDisabled}
          style={isSendButtonDisabled ? disabledButtonStyle : buttonStyle}
          type="submit"
        >
          发送消息
        </button>
      </div>
    </form>
  );
}

const buttonStyle = {
  background: "#101828",
  border: 0,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.75rem 1.1rem"
} as const;

const disabledButtonStyle = {
  ...buttonStyle,
  cursor: "not-allowed",
  opacity: 0.55
} as const;

function appendMentionLabel(content: string, mentionLabel: string): string {
  const trimmedEnd = content.trimEnd();

  if (!trimmedEnd) {
    return `${mentionLabel} `;
  }

  return `${trimmedEnd} ${mentionLabel} `;
}

function resolveMentionedMemberIds(
  content: string,
  members: ChannelMember[],
  selectedMemberIds: string[]
): string[] {
  const resolvedMemberIds = new Set(selectedMemberIds);

  for (const member of members) {
    if (contentHasMentionLabel(content, buildMentionLabel(member.displayName))) {
      resolvedMemberIds.add(member.memberId);
    }
  }

  return [...resolvedMemberIds];
}

function contentHasMentionLabel(content: string, mentionLabel: string): boolean {
  let searchFrom = 0;

  while (searchFrom < content.length) {
    const index = content.indexOf(mentionLabel, searchFrom);

    if (index === -1) {
      return false;
    }

    const before = content[index - 1];
    const after = content[index + mentionLabel.length];

    if (isMentionBoundary(before) && isMentionBoundary(after)) {
      return true;
    }

    searchFrom = index + mentionLabel.length;
  }

  return false;
}

function isMentionBoundary(character: string | undefined): boolean {
  if (!character) {
    return true;
  }

  return /\s/.test(character) || mentionBoundaryCharacters.includes(character);
}

const mentionBoundaryCharacters = ",，。.!?！？；;:：、()[]{}<>\"'`";

function isMentionableMember(member: ChannelMember): boolean {
  return (
    (member.kind === "ai" && member.status === "available") ||
    (member.kind === "human" && member.status === "active" && Boolean(member.userId))
  );
}

function mapParticipantToMember(participant: ConversationAgentMember): ChannelMember {
  return {
    avatarUrl: null,
    displayName: participant.agentName,
    joinedAt: null,
    kind: "ai",
    lastActiveAt: null,
    memberId: `ai:${participant.agentId}`,
    permission: "comment",
    role: "ai_teammate",
    status: "available",
    teammateId: participant.agentId
  };
}
