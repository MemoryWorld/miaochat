"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { ChannelMember, ConversationAgentMember } from "@agenthub/contracts";

import { ArrowUpIcon, PaperclipIcon } from "../../components/ui/icons";
import { cn } from "../../lib/cn";
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
  const formRef = useRef<HTMLFormElement | null>(null);
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
      className="grid gap-2"
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
      ref={formRef}
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

      {showActionSuggestions ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">快捷动作</span>
          {[
            { label: "制作网页", value: "请制作一个响应式单文件 HTML 网页，并生成可下载产物。" },
            { label: "创建 Workflow", value: "请创建一个可视化 workflow，先展示节点预览和输入输出，等待我执行。" },
            { label: "修改产物", value: "请基于当前最新产物继续修改，并说明变更点。" },
            { label: "部署状态", value: "请检查当前网页产物是否可以部署，并给出部署状态。" }
          ].map((action) => (
            <button
              className="rounded-full bg-black/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-black/[0.09]"
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
      ) : null}

      {attachments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {attachments.map((file) => (
            <span
              className="rounded-full bg-black/[0.05] px-3 py-1 text-xs font-medium text-foreground"
              key={`${file.name}:${file.size}:${file.lastModified}`}
            >
              {file.name}
            </span>
          ))}
          <span className="text-xs text-muted-foreground">
            {attachments.length} 个文件
          </span>
        </div>
      ) : null}

      {showDisabledReason ? (
        <p
          className="m-0 px-1 text-xs font-medium text-amber-600"
          id={disabledReasonId}
          role="status"
        >
          {disabledReason}
        </p>
      ) : null}

      <div
        className={cn(
          "flex items-end gap-1.5 rounded-[1.4rem] bg-white px-2 py-1.5 shadow-card transition-shadow focus-within:shadow-pop",
          disabled && "opacity-70"
        )}
      >
        <label
          className={cn(
            "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/[0.06] hover:text-foreground",
            disabled && "pointer-events-none"
          )}
          htmlFor={fileInputId}
          title="选择文件"
        >
          <PaperclipIcon size={19} />
          <span className="sr-only">选择文件</span>
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
        <label className="flex min-w-0 flex-1" htmlFor="chat-composer-input">
          <span className="sr-only">消息内容</span>
          <textarea
            className="max-h-44 min-h-[2.25rem] w-full resize-none self-center border-0 bg-transparent px-1.5 py-1.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
            disabled={disabled}
            id="chat-composer-input"
            onChange={(event) => {
              setContent(event.target.value);
              autoGrow(event.target);
              onTyping?.();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            placeholder="输入任务，或 @ 指定 Agent…"
            rows={1}
            value={content}
          />
        </label>
        <button
          aria-describedby={showDisabledReason ? disabledReasonId : undefined}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            isSendButtonDisabled
              ? "cursor-not-allowed bg-black/[0.06] text-muted-foreground/60"
              : "bg-[#007aff] text-white hover:bg-[#0070eb]"
          )}
          disabled={isSendButtonDisabled}
          type="submit"
        >
          <ArrowUpIcon size={19} strokeWidth={2.2} />
          <span className="sr-only">发送消息</span>
        </button>
      </div>
    </form>
  );
}

function autoGrow(element: HTMLTextAreaElement): void {
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
}

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
