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
    <div className="grid gap-2">
      <div className="text-xs font-semibold text-slate-500">提及 Agent 或成员</div>
      <div className="flex flex-wrap gap-2">
        {mentionableMembers.map((member) => {
          const isSelected = selectedMemberIds.includes(member.memberId);

          return (
            <button
              aria-pressed={isSelected}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                isSelected
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
