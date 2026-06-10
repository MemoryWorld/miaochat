"use client";

import type { ChannelMember } from "@agenthub/contracts";

type MemberMentionInputProps = {
  disabled?: boolean;
  members: ChannelMember[];
  onToggleMember: (member: ChannelMember) => void;
  selectedMemberIds: string[];
};

export function MemberMentionInput({
  disabled = false,
  members,
  onToggleMember,
  selectedMemberIds
}: MemberMentionInputProps) {
  const mentionableMembers = members.filter(
    (member) =>
      (member.kind === "ai" && member.status === "available") ||
      (member.kind === "human" && member.status === "active" && member.userId)
  );

  if (mentionableMembers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">提及 Agent 或成员</span>
      <div className="flex flex-wrap gap-1.5">
        {mentionableMembers.map((member) => {
          const isSelected = selectedMemberIds.includes(member.memberId);

          return (
            <button
              aria-pressed={isSelected}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-[#007aff]/12 text-[#007aff]"
                  : "bg-black/[0.05] text-foreground hover:bg-black/[0.09]"
              }`}
              disabled={disabled}
              key={member.memberId}
              onClick={() => {
                onToggleMember(member);
              }}
              type="button"
            >
              {buildMentionLabel(member.displayName)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function buildMentionLabel(displayName: string): string {
  const normalized = displayName.trim().replace(/\s+/g, "");

  return `@${normalized || "成员"}`;
}
