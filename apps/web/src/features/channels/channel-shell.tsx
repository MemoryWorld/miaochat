"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import type {
  ActivityRound,
  Artifact,
  ArtifactUploadTarget,
  ApprovalRequest,
  ChannelSummary,
  ChannelMember,
  ChannelMemberList,
  ChannelNotificationPreference,
  ChannelReadState,
  Conversation,
  ConversationAgentMember,
  CodingWorkflowDecision,
  CodingWorkflowDetail,
  FileSurfaceEntry,
  Message,
  MessageThread,
  OrchestratorStatusEventPayload,
  WorkspaceMemberDirectoryEntry
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { ChatComposer } from "../chat/chat-composer";
import { ChatThread } from "../chat/chat-thread";
import { CodingWorkflowPanel } from "../chat/coding-workflow-panel";
import { PresenceBar } from "../chat/presence-bar";
import { useConversationStream } from "../chat/use-conversation-stream";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const channelTabs = [
  { id: "chat", label: "聊天" },
  { id: "files", label: "文件" }
] as const;
const postSendRefreshDelaysMs = [1_200, 4_000, 8_000] as const;

type ChannelShellProps = {
  channelId: string;
  initialTab?: string;
};

export function ChannelShell({ channelId, initialTab = "chat" }: ChannelShellProps) {
  const { activeWorkspaceId, isLoading, selectWorkspace, workspaces } = useActiveWorkspace();
  const activeTab = channelTabs.some((tab) => tab.id === initialTab) ? initialTab : "chat";
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);
  const [artifactsByMessageId, setArtifactsByMessageId] = useState<Record<string, Artifact[]>>({});
  const [busyDecision, setBusyDecision] = useState<CodingWorkflowDecision | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPinningMessageId, setIsPinningMessageId] = useState<string | null>(null);
  const [isPinnedDrawerOpen, setIsPinnedDrawerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [liveAssistantMessage, setLiveAssistantMessage] = useState<{
    content: string;
    id: string;
  } | null>(null);
  const [threadDrawer, setThreadDrawer] = useState<{
    error: string | null;
    isLoading: boolean;
    parent: Message;
    replies: Message[];
  } | null>(null);
  const [timelineMessages, setTimelineMessages] = useState<Message[]>([]);
  const postSendRefreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const processedStreamEventCountRef = useRef(0);
  const channels = useSurfaceData<ChannelSummary[]>(
    isWorkspaceReady ? `/channels?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const conversations = useSurfaceData<Conversation[]>(
    isWorkspaceReady ? `/conversations?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const channelRoster = useSurfaceData<ChannelMemberList | null>(
    isWorkspaceReady ? `/channels/${channelId}/members?workspaceId=${activeWorkspaceId}` : null,
    null
  );
  const workspaceDirectory = useSurfaceData<WorkspaceMemberDirectoryEntry[]>(
    isWorkspaceReady ? `/workspace-member-directory?workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const messages = useSurfaceData<Message[]>(
    isWorkspaceReady ? `/messages?conversationId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const readState = useSurfaceData<ChannelReadState | null>(
    isWorkspaceReady ? `/channels/${channelId}/read-state?workspaceId=${activeWorkspaceId}` : null,
    null
  );
  const files = useSurfaceData<FileSurfaceEntry[]>(
    isWorkspaceReady ? `/channel-files?channelId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const activity = useSurfaceData<ActivityRound[]>(
    isWorkspaceReady ? `/activity?channelId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const approvals = useSurfaceData<ApprovalRequest[]>(
    isWorkspaceReady ? `/approvals?channelId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    []
  );
  const workflow = useSurfaceData<CodingWorkflowDetail | null>(
    isWorkspaceReady ? `/coding-workflows?conversationId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    null
  );
  const stream = useConversationStream({
    conversationId: channelId,
    workspaceId: activeWorkspaceId
  });

  const channel = useMemo(
    () => channels.data.find((entry) => entry.id === channelId) ?? null,
    [channelId, channels.data]
  );
  const conversation = useMemo(
    () => conversations.data.find((entry) => entry.id === channelId) ?? null,
    [channelId, conversations.data]
  );
  const channelParticipants = useMemo<ConversationAgentMember[]>(
    () =>
      conversation?.participants ??
      workflow.data?.teammates.map((teammate) => ({
        agentId: teammate.agentId,
        agentName: teammate.name
      })) ??
      [],
    [conversation?.participants, workflow.data?.teammates]
  );
  const channelMembers = useMemo(
    () => channelRoster.data?.members ?? normalizeChannelMembers(channelParticipants),
    [channelParticipants, channelRoster.data?.members]
  );
  const statusEvents = stream.events.flatMap((event) =>
    event.kind === "conversation.status" ? [event.payload as OrchestratorStatusEventPayload] : []
  );
  const failedActivity = activity.data.filter((round) => round.status === "failed");
  const pinnedMessages = useMemo(
    () => timelineMessages.filter((message) => message.isPinned),
    [timelineMessages]
  );
  const displayedMessages = useMemo(() => {
    const query = messageSearchQuery.trim().toLowerCase();

    if (!query) {
      return timelineMessages;
    }

    return timelineMessages.filter((message) => {
      const authorLabel = resolveMessageAuthorLabel(message) ?? "";

      return (
        message.content.toLowerCase().includes(query) ||
        authorLabel.toLowerCase().includes(query)
      );
    });
  }, [messageSearchQuery, timelineMessages]);
  const availableAiMembers = useMemo(
    () =>
      channelMembers.filter(
        (member): member is Extract<ChannelMember, { kind: "ai" }> =>
          member.kind === "ai" && member.status === "available"
      ),
    [channelMembers]
  );

  useEffect(() => {
    setTimelineMessages(messages.data);
    setLiveAssistantMessage((current) =>
      current && messages.data.some((message) => message.id === current.id) ? null : current
    );
    void refreshArtifactsForMessages(messages.data);
  }, [messages.data]);

  useEffect(() => {
    const lastMessage = messages.data.at(-1);

    if (!lastMessage || !activeWorkspaceId) {
      return;
    }

    void fetch(`${apiBaseUrl}/streams/${channelId}/presence`, {
      body: JSON.stringify({
        action: "read",
        lastReadMessageId: lastMessage.id,
        workspaceId: activeWorkspaceId
      }),
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    }).catch(() => undefined);
    void fetch(`${apiBaseUrl}/channels/${channelId}/read-state`, {
      body: JSON.stringify({
        lastReadMessageId: lastMessage.id,
        workspaceId: activeWorkspaceId
      }),
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    })
      .then(() => Promise.all([channels.refresh(), readState.refresh()]))
      .catch(() => undefined);
  }, [activeWorkspaceId, channelId, channels.refresh, messages.data, readState.refresh]);

  useEffect(() => {
    processedStreamEventCountRef.current = 0;
    clearPostSendRefreshTimers();
    setLiveAssistantMessage(null);
  }, [channelId]);

  useEffect(() => () => clearPostSendRefreshTimers(), []);

  useEffect(() => {
    if (stream.events.length < processedStreamEventCountRef.current) {
      processedStreamEventCountRef.current = 0;
    }

    const nextEvents = stream.events.slice(processedStreamEventCountRef.current);

    if (nextEvents.length === 0) {
      return;
    }

    processedStreamEventCountRef.current = stream.events.length;

    for (const event of nextEvents) {
      startTransition(() => {
        if (event.kind === "conversation.message.started") {
          setLiveAssistantMessage({
            content: "",
            id: event.payload.messageId
          });
          return;
        }

        if (event.kind === "conversation.message.delta") {
          setLiveAssistantMessage((current) => ({
            content:
              current?.id === event.payload.messageId
                ? `${current.content}${event.payload.delta}`
                : event.payload.delta,
            id: event.payload.messageId
          }));
          return;
        }

        if (event.kind === "conversation.message.completed") {
          clearPostSendRefreshTimers();
          setLiveAssistantMessage({
            content: event.payload.finalContent,
            id: event.payload.messageId
          });
          void messages.refresh();
        }
      });
    }
  }, [messages.refresh, stream.events]);

  async function handleDecision(input: {
    decision: CodingWorkflowDecision;
    note: string;
  }): Promise<void> {
    if (!workflow.data) {
      return;
    }

    setBusyDecision(input.decision);

    try {
      await fetch(`${apiBaseUrl}/coding-workflows/${workflow.data.id}/decisions`, {
        body: JSON.stringify({
          decision: input.decision,
          note: input.note,
          workspaceId: activeWorkspaceId
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      await Promise.all([
        workflow.refresh(),
        approvals.refresh(),
        activity.refresh(),
        messages.refresh()
      ]);
    } finally {
      setBusyDecision(null);
    }
  }

  async function handleSend(input: {
    attachments: File[];
    content: string;
    mentionedAgentIds: string[];
    mentionedUserIds: string[];
    threadParentMessageId?: string | null;
  }): Promise<void> {
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await fetch(`${apiBaseUrl}/messages/send`, {
        body: JSON.stringify({
          content: input.content,
          conversationId: channelId,
          mentionedAgentIds: input.mentionedAgentIds,
          mentionedUserIds: input.mentionedUserIds,
          role: "user",
          threadParentMessageId: input.threadParentMessageId ?? null,
          workspaceId: activeWorkspaceId
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "Failed to send the message."));
      }

      const message = payload as Message;
      startTransition(() => {
        if (message.threadParentMessageId) {
          setThreadDrawer((current) =>
            current && current.parent.id === message.threadParentMessageId
              ? {
                  ...current,
                  replies: [...current.replies, message]
                }
              : current
          );
          setTimelineMessages((current) =>
            current.map((entry) =>
              entry.id === message.threadParentMessageId
                ? {
                    ...entry,
                    threadLastReplyAt: message.createdAt,
                    threadReplyCount: entry.threadReplyCount + 1
                  }
                : entry
            )
          );
        } else {
          setTimelineMessages((current) => [...current, message]);
        }
      });
      schedulePostSendRefresh();
      if (input.attachments.length > 0) {
        await createArtifactsForMessage(message, input.attachments);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to send the message."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleAiAction(content: string): Promise<void> {
    await handleSend({
      attachments: [],
      content,
      mentionedAgentIds: availableAiMembers[0] ? [availableAiMembers[0].teammateId] : [],
      mentionedUserIds: []
    });
  }

  async function handleInviteHumanMembers(input: {
    emails: string[];
    permission: "comment" | "read";
    userIds: string[];
  }): Promise<void> {
    setMemberActionError(null);
    setMemberActionId("invite");

    try {
      const response = await fetch(`${apiBaseUrl}/channels/${channelId}/members/humans`, {
        body: JSON.stringify({
          emails: input.emails,
          permission: input.permission,
          userIds: input.userIds,
          workspaceId: activeWorkspaceId
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "邀请同事失败。"));
      }

      await channelRoster.refresh();
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : "邀请同事失败。");
    } finally {
      setMemberActionId(null);
    }
  }

  async function handleRemoveMember(member: ChannelMember): Promise<void> {
    const confirmed = window.confirm(`确认要从频道移除「${member.displayName}」吗？`);

    if (!confirmed) {
      return;
    }

    setMemberActionError(null);
    setMemberActionId(member.memberId);

    try {
      const response = await fetch(
        `${apiBaseUrl}/channels/${channelId}/members/${encodeURIComponent(
          member.memberId
        )}?workspaceId=${activeWorkspaceId}`,
        {
          credentials: "include",
          method: "DELETE"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "移除频道成员失败。"));
      }

      await Promise.all([channelRoster.refresh(), conversations.refresh()]);
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : "移除频道成员失败。");
    } finally {
      setMemberActionId(null);
    }
  }

  async function handleUpdateHumanPermission(
    member: ChannelMember,
    permission: "comment" | "read"
  ): Promise<void> {
    setMemberActionError(null);
    setMemberActionId(member.memberId);

    try {
      const response = await fetch(
        `${apiBaseUrl}/channels/${channelId}/members/${encodeURIComponent(member.memberId)}`,
        {
          body: JSON.stringify({
            permission,
            workspaceId: activeWorkspaceId
          }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "更新频道权限失败。"));
      }

      await channelRoster.refresh();
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : "更新频道权限失败。");
    } finally {
      setMemberActionId(null);
    }
  }

  async function handleUpdateNotificationPreference(
    notificationPreference: ChannelNotificationPreference
  ): Promise<void> {
    if (!activeWorkspaceId) {
      return;
    }

    setMemberActionError(null);
    setMemberActionId("notification");

    try {
      const response = await fetch(
        `${apiBaseUrl}/channels/${channelId}/notification-preference`,
        {
          body: JSON.stringify({
            notificationPreference,
            workspaceId: activeWorkspaceId
          }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "更新通知设置失败。"));
      }

      await Promise.all([readState.refresh(), channels.refresh()]);
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : "更新通知设置失败。");
    } finally {
      setMemberActionId(null);
    }
  }

  async function handleToggleReaction(message: Message, emoji: string): Promise<void> {
    if (!activeWorkspaceId) {
      return;
    }

    const response = await fetch(
      `${apiBaseUrl}/messages/${encodeURIComponent(message.id)}/reactions`,
      {
        body: JSON.stringify({
          emoji,
          workspaceId: activeWorkspaceId
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      }
    );
    const payload = await readJson(response);

    if (!response.ok) {
      setErrorMessage(readErrorMessage(payload, "更新回应失败。"));
      return;
    }

    const updated = payload as Message;
    setTimelineMessages((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry))
    );
    setThreadDrawer((current) =>
      current
        ? {
            ...current,
            parent: current.parent.id === updated.id ? updated : current.parent,
            replies: current.replies.map((entry) =>
              entry.id === updated.id ? updated : entry
            )
          }
        : current
    );
  }

  async function handleOpenThread(message: Message): Promise<void> {
    if (!activeWorkspaceId) {
      return;
    }

    setThreadDrawer({
      error: null,
      isLoading: true,
      parent: message,
      replies: []
    });

    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${encodeURIComponent(message.id)}/thread?workspaceId=${activeWorkspaceId}`,
        {
          credentials: "include"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "加载线程失败。"));
      }

      const thread = payload as MessageThread;
      setThreadDrawer({
        error: null,
        isLoading: false,
        parent: thread.parent,
        replies: thread.replies
      });
      await refreshArtifactsForMessages([thread.parent, ...thread.replies]);
    } catch (error) {
      setThreadDrawer((current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : "加载线程失败。",
              isLoading: false
            }
          : current
      );
    }
  }

  async function handleSendThreadReply(input: {
    attachments: File[];
    content: string;
    mentionedAgentIds: string[];
    mentionedUserIds: string[];
  }): Promise<void> {
    if (!threadDrawer) {
      return;
    }

    await handleSend({
      ...input,
      threadParentMessageId: threadDrawer.parent.id
    });
  }

  async function createArtifactsForMessage(message: Message, attachments: File[]): Promise<void> {
    if (!activeWorkspaceId || attachments.length === 0) {
      return;
    }

    for (const file of attachments) {
      const kind = file.type.startsWith("image/") ? "image" : "attachment";
      const mimeType = file.type || "application/octet-stream";
      const uploadTargetResponse = await fetch(`${apiBaseUrl}/artifacts/upload-target`, {
        body: JSON.stringify({
          fileName: file.name,
          kind,
          messageId: message.id,
          mimeType,
          title: file.name,
          workspaceId: activeWorkspaceId
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const uploadTargetPayload = await readJson(uploadTargetResponse);

      if (!uploadTargetResponse.ok) {
        throw new Error(
          readErrorMessage(uploadTargetPayload, `附件 ${file.name} 上传地址创建失败。`)
        );
      }

      const uploadTarget = uploadTargetPayload as ArtifactUploadTarget;
      const uploadResponse = await fetch(uploadTarget.uploadUrl, {
        body: file,
        headers: uploadTarget.uploadHeaders,
        method: uploadTarget.uploadMethod
      });

      if (!uploadResponse.ok) {
        throw new Error(`附件 ${file.name} 上传失败。`);
      }

      const artifactResponse = await fetch(`${apiBaseUrl}/artifacts`, {
        body: JSON.stringify({
          id: uploadTarget.artifactId,
          kind,
          messageId: message.id,
          mimeType,
          previewUrl: uploadTarget.previewUrl,
          storageKey: uploadTarget.storageKey,
          title: file.name,
          workspaceId: activeWorkspaceId
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const artifactPayload = await readJson(artifactResponse);

      if (!artifactResponse.ok) {
        throw new Error(readErrorMessage(artifactPayload, `附件 ${file.name} 保存失败。`));
      }
    }

    await Promise.all([refreshArtifactsForMessages([message]), files.refresh()]);
  }

  async function refreshArtifactsForMessages(nextMessages: Message[]): Promise<void> {
    if (!activeWorkspaceId || nextMessages.length === 0) {
      return;
    }

    const uniqueMessageIds = Array.from(new Set(nextMessages.map((message) => message.id)));
    const entries = await Promise.all(
      uniqueMessageIds.map(async (messageId) => {
        try {
          const response = await fetch(
            `${apiBaseUrl}/artifacts?messageId=${encodeURIComponent(messageId)}&workspaceId=${activeWorkspaceId}`,
            {
              credentials: "include"
            }
          );
          const payload = await readJson(response);

          if (!response.ok) {
            return [messageId, []] as const;
          }

          return [messageId, (payload as Artifact[]) ?? []] as const;
        } catch {
          return [messageId, []] as const;
        }
      })
    );

    setArtifactsByMessageId((current) => ({
      ...current,
      ...Object.fromEntries(entries)
    }));
  }

  function handleTyping(): void {
    void fetch(`${apiBaseUrl}/streams/${channelId}/presence`, {
      body: JSON.stringify({
        action: "typing",
        workspaceId: activeWorkspaceId
      }),
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    }).catch(() => undefined);
  }

  function clearPostSendRefreshTimers(): void {
    for (const timer of postSendRefreshTimersRef.current) {
      clearTimeout(timer);
    }
    postSendRefreshTimersRef.current = [];
  }

  function schedulePostSendRefresh(): void {
    clearPostSendRefreshTimers();
    postSendRefreshTimersRef.current = postSendRefreshDelaysMs.map((delay) =>
      setTimeout(() => {
        void messages.refresh();
      }, delay)
    );
  }

  async function handlePinMessage(messageId: string): Promise<void> {
    setErrorMessage(null);
    setIsPinningMessageId(messageId);

    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${messageId}/pin?workspaceId=${activeWorkspaceId}`,
        {
          credentials: "include",
          method: "POST"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "Failed to pin the selected message."));
      }

      const parsed = payload as {
        message: Message;
      };

      startTransition(() => {
        setTimelineMessages((current) =>
          current.map((message) =>
            message.id === parsed.message.id ? parsed.message : message
          )
        );
        setThreadDrawer((current) =>
          current
            ? {
                ...current,
                parent:
                  current.parent.id === parsed.message.id ? parsed.message : current.parent,
                replies: current.replies.map((message) =>
                  message.id === parsed.message.id ? parsed.message : message
                )
              }
            : current
        );
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to pin the selected message."
      );
    } finally {
      setIsPinningMessageId(null);
    }
  }

  function resolveMessageAuthorLabel(message: Message): string | undefined {
    if (message.author?.displayName) {
      return message.author.displayName;
    }

    if (message.role === "user") {
      return "你";
    }

    if (message.role === "system") {
      return "系统";
    }

    if (!message.sourceAgentId) {
      return "AI 同事";
    }

    const participant =
      channelParticipants.find((entry) => entry.agentId === message.sourceAgentId) ??
      workflow.data?.teammates.find((entry) => entry.agentId === message.sourceAgentId);

    if (!participant) {
      return "AI 同事";
    }

    return "agentName" in participant ? participant.agentName : participant.name;
  }

  return (
    <AppShell
      sidebarMode="inline"
      sidebar={
        <div className="grid gap-4">
          <div>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
              {channel?.title ?? conversation?.title ?? "正在加载频道"}
            </h1>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              {channel?.summary ?? "消息、文件、审批和活动都围绕这个频道持续沉淀。"}
            </p>
          </div>
          <div className="grid gap-2">
            {channelTabs.map((tab) => {
              const isActive = tab.id === activeTab;

              return (
                <Link
                  key={tab.id}
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold no-underline transition ${
                    isActive
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white/80 text-slate-700 hover:bg-white"
                  }`}
                  href={`/channels/${channelId}?tab=${tab.id}`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
          <div className="grid gap-2 rounded-[24px] border border-slate-200 bg-white/80 p-4 text-sm leading-7 text-slate-600">
            <div className="font-semibold text-slate-950">当前频道概况</div>
            <div>AI 同事：{channel?.memberTeammateIds.length ?? channelParticipants.length}</div>
            <div>审批：{approvals.data.length}</div>
            <div>活动轮次：{activity.data.length}</div>
            {failedActivity.length > 0 ? (
              <div className="font-semibold text-red-700">需要处理：{failedActivity.length}</div>
            ) : null}
          </div>
        </div>
      }
      workspaceSlot={
        <WorkspaceSwitcher
          activeWorkspaceId={activeWorkspaceId}
          isLoading={isLoading}
          onSelect={selectWorkspace}
          workspaces={workspaces}
        />
      }
    >
      {activeTab === "chat" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid min-w-0 gap-4">
            {errorMessage ? (
              <p className="m-0 text-sm font-medium text-red-700">{errorMessage}</p>
            ) : null}
            {workflow.data ? (
              <CodingWorkflowPanel
                busyDecision={busyDecision}
                messages={messages.data}
                onDecision={handleDecision}
                workflow={workflow.data}
              />
            ) : null}

            {failedActivity.length > 0 ? (
              <RecoveryActions
                channelId={channelId}
                failedActivity={failedActivity}
                onRefresh={() => void Promise.all([activity.refresh(), messages.refresh()])}
              />
            ) : null}

            <section className="grid gap-3 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="m-0 text-base font-semibold text-slate-950">频道消息</h2>
                  <p className="mb-0 mt-1 text-sm text-slate-500">
                    {displayedMessages.length} 条可见消息 · {pinnedMessages.length} 条已置顶 · 未读 {readState.data?.unreadCount ?? 0} 条
                  </p>
                </div>
                <button
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
                  onClick={() => {
                    setIsPinnedDrawerOpen((current) => !current);
                  }}
                  type="button"
                >
                  {isPinnedDrawerOpen ? "收起置顶" : "查看置顶"}
                </button>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                搜索频道
                <input
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  onChange={(event) => {
                    setMessageSearchQuery(event.target.value);
                  }}
                  placeholder="按内容或作者搜索"
                  type="search"
                  value={messageSearchQuery}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "让 AI 总结", value: "请总结当前频道的关键结论、风险和下一步。" },
                  { label: "生成计划", value: "请基于当前频道上下文生成一份执行计划。" },
                  { label: "评审讨论", value: "请评审当前讨论里的技术风险和遗漏点。" },
                  { label: "创建任务", value: "请把当前讨论拆成可执行任务清单。" }
                ].map((action) => (
                  <button
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSending || availableAiMembers.length === 0}
                    key={action.label}
                    onClick={() => {
                      void handleAiAction(action.value);
                    }}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              {isPinnedDrawerOpen ? (
                <div className="grid gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                  {pinnedMessages.length > 0 ? (
                    pinnedMessages.map((message) => (
                      <a
                        className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 no-underline transition hover:bg-slate-100"
                        href={`#message-${message.id}`}
                        key={message.id}
                      >
                        <strong className="text-slate-950">
                          {resolveMessageAuthorLabel(message) ?? "频道成员"}
                        </strong>
                        ：{message.content.slice(0, 80)}
                      </a>
                    ))
                  ) : (
                    <p className="m-0 text-sm text-slate-500">当前还没有置顶消息。</p>
                  )}
                </div>
              ) : null}
              {activeWorkspaceId ? (
                <PresenceBar conversationId={channelId} workspaceId={activeWorkspaceId} />
              ) : null}
            </section>

            {approvals.data.length > 0 ? (
              <section className="grid gap-3 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <h2 className="m-0 text-lg font-semibold text-slate-950">审批卡片</h2>
                <div className="grid gap-3">
                  {approvals.data.map((approval) => (
                    <article
                      key={approval.id}
                      className="rounded-[22px] border border-slate-200 bg-white/85 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-slate-950">{approval.title}</strong>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          {renderApprovalStatus(approval.status)}
                        </span>
                      </div>
                      <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">{approval.summary}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <ChatThread
              artifactsByMessageId={artifactsByMessageId}
              connectionState={stream.connectionState}
              deployments={[]}
              isPinningMessageId={isPinningMessageId}
              liveAssistantMessage={liveAssistantMessage}
              messages={displayedMessages}
              onPinMessage={handlePinMessage}
              onReplyMessage={handleOpenThread}
              onToggleReaction={handleToggleReaction}
              resolveAuthorLabel={resolveMessageAuthorLabel}
              statusEvents={statusEvents}
            />
            {threadDrawer ? (
              <ThreadDrawer
                artifactsByMessageId={artifactsByMessageId}
                channelMembers={channelMembers}
                isSending={isSending}
                onClose={() => setThreadDrawer(null)}
                onPinMessage={handlePinMessage}
                onSendReply={handleSendThreadReply}
                onToggleReaction={handleToggleReaction}
                resolveAuthorLabel={resolveMessageAuthorLabel}
                thread={threadDrawer}
              />
            ) : null}
            <ChatComposer
              disabled={isSending}
              members={channelMembers}
              onSend={handleSend}
              onTyping={handleTyping}
              participants={channelParticipants}
            />
          </div>
          <ChannelMembersPanel
            actionError={memberActionError}
            busyMemberId={memberActionId}
            channelId={channelId}
            directory={workspaceDirectory.data}
            isLoading={channelRoster.isLoading}
            members={channelMembers}
            onInviteHumans={handleInviteHumanMembers}
            onRemoveMember={handleRemoveMember}
            onUpdateNotificationPreference={handleUpdateNotificationPreference}
            onUpdateHumanPermission={handleUpdateHumanPermission}
            readState={readState.data}
            roster={channelRoster.data}
          />
        </div>
      ) : (
        <section className="grid gap-3">
          {files.data.length === 0 ? (
            <SurfaceEmpty body="当前频道还没有产出文件。" title="文件面为空" />
          ) : (
            files.data.map((file) => (
              <article
                key={file.id}
                className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong className="text-slate-950">{file.title}</strong>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {file.kind}
                  </span>
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  MIME: {file.mimeType}
                </div>
                {file.previewUrl ? (
                  <a
                    className="mt-3 inline-flex text-sm font-semibold text-sky-700 no-underline transition hover:text-sky-600"
                    href={file.previewUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    打开预览
                  </a>
                ) : null}
              </article>
            ))
          )}
        </section>
      )}
    </AppShell>
  );
}

function ThreadDrawer({
  artifactsByMessageId,
  channelMembers,
  isSending,
  onClose,
  onPinMessage,
  onSendReply,
  onToggleReaction,
  resolveAuthorLabel,
  thread
}: {
  artifactsByMessageId: Record<string, Artifact[]>;
  channelMembers: ChannelMember[];
  isSending: boolean;
  onClose: () => void;
  onPinMessage: (messageId: string) => Promise<void>;
  onSendReply: (input: {
    attachments: File[];
    content: string;
    mentionedAgentIds: string[];
    mentionedUserIds: string[];
  }) => Promise<void>;
  onToggleReaction: (message: Message, emoji: string) => Promise<void>;
  resolveAuthorLabel: (message: Message) => string | undefined;
  thread: {
    error: string | null;
    isLoading: boolean;
    parent: Message;
    replies: Message[];
  };
}) {
  const threadMessages = [thread.parent, ...thread.replies];

  return (
    <section className="grid gap-3 rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-slate-950">线程回复</h2>
          <p className="mb-0 mt-1 text-sm text-slate-500">
            围绕一条消息继续讨论，主频道只显示回复数量。
          </p>
        </div>
        <button
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </div>
      {thread.error ? (
        <p className="m-0 text-sm font-medium text-red-700">{thread.error}</p>
      ) : null}
      {thread.isLoading ? (
        <p className="m-0 text-sm text-slate-500">正在加载线程...</p>
      ) : (
        <>
          <ChatThread
            artifactsByMessageId={artifactsByMessageId}
            connectionState="idle"
            deployments={[]}
            isPinningMessageId={null}
            liveAssistantMessage={null}
            messages={threadMessages}
            onPinMessage={onPinMessage}
            onToggleReaction={onToggleReaction}
            resolveAuthorLabel={resolveAuthorLabel}
            statusEvents={[]}
          />
          <ChatComposer
            disabled={isSending}
            members={channelMembers}
            onSend={onSendReply}
          />
        </>
      )}
    </section>
  );
}

function ChannelMembersPanel({
  actionError,
  busyMemberId,
  channelId,
  directory,
  isLoading,
  members,
  onInviteHumans,
  onRemoveMember,
  onUpdateNotificationPreference,
  onUpdateHumanPermission,
  readState,
  roster
}: {
  actionError: string | null;
  busyMemberId: string | null;
  channelId: string;
  members: ChannelMember[];
  directory: WorkspaceMemberDirectoryEntry[];
  isLoading: boolean;
  onInviteHumans: (input: {
    emails: string[];
    permission: "comment" | "read";
    userIds: string[];
  }) => Promise<void>;
  onRemoveMember: (member: ChannelMember) => Promise<void>;
  onUpdateNotificationPreference: (
    notificationPreference: ChannelNotificationPreference
  ) => Promise<void>;
  onUpdateHumanPermission: (
    member: ChannelMember,
    permission: "comment" | "read"
  ) => Promise<void>;
  readState: ChannelReadState | null;
  roster: ChannelMemberList | null;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"comment" | "read">("comment");
  const [selectedUserId, setSelectedUserId] = useState("");
  const returnTo = `/channels/${channelId}?tab=chat`;
  const createTeammateHref = `/teammates/new?channelId=${encodeURIComponent(
    channelId
  )}&returnTo=${encodeURIComponent(returnTo)}`;
  const humanMembers = members.filter((member) => member.kind === "human");
  const aiMembers = members.filter((member) => member.kind === "ai");
  const existingHumanUserIds = new Set(
    humanMembers.flatMap((member) => (member.userId ? [member.userId] : []))
  );
  const inviteCandidates = directory.filter(
    (entry) => entry.actorType === "human" && entry.userId && !existingHumanUserIds.has(entry.userId)
  );

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const emails = inviteEmail
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const userIds = selectedUserId ? [selectedUserId] : [];

    if (emails.length === 0 && userIds.length === 0) {
      return;
    }

    await onInviteHumans({
      emails,
      permission: invitePermission,
      userIds
    });
    setInviteEmail("");
    setSelectedUserId("");
  }

  return (
    <aside
      aria-label="频道成员"
      className="grid gap-4 self-start rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-sm xl:sticky xl:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-slate-950">成员与权限</h2>
          <p className="mb-0 mt-2 text-sm text-slate-500">
            {isLoading && !roster
              ? "正在同步频道成员..."
              : `${roster?.totalCount ?? members.length} 位成员 · ${roster?.humanCount ?? humanMembers.length} 位同事 · ${roster?.aiCount ?? aiMembers.length} 位 AI 同事`}
          </p>
        </div>
        <Link
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
          href={createTeammateHref}
        >
          新建 AI 同事
        </Link>
      </div>
      <form className="grid gap-3 rounded-[22px] border border-slate-200 bg-slate-50/70 p-3" onSubmit={handleInviteSubmit}>
        <div className="text-sm font-semibold text-slate-950">邀请同事</div>
        {inviteCandidates.length > 0 ? (
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            工作区同事
            <select
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              onChange={(event) => {
                setSelectedUserId(event.target.value);
              }}
              value={selectedUserId}
            >
              <option value="">选择已有同事</option>
              {inviteCandidates.map((entry) => (
                <option key={entry.id} value={entry.userId ?? ""}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          邮箱邀请
          <input
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            onChange={(event) => {
              setInviteEmail(event.target.value);
            }}
            placeholder="name@example.com"
            type="text"
            value={inviteEmail}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
            onChange={(event) => {
              setInvitePermission(event.target.value === "read" ? "read" : "comment");
            }}
            value={invitePermission}
          >
            <option value="comment">可发言</option>
            <option value="read">只读</option>
          </select>
          <button
            className="rounded-full bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busyMemberId === "invite" || (!selectedUserId && !inviteEmail.trim())}
            type="submit"
          >
            {busyMemberId === "invite" ? "邀请中..." : "邀请"}
          </button>
        </div>
        {actionError ? (
          <p className="m-0 text-xs font-semibold leading-6 text-red-700">{actionError}</p>
        ) : null}
      </form>
      <div className="grid gap-3 rounded-[22px] border border-slate-200 bg-slate-50/70 p-3">
        <div>
          <div className="text-sm font-semibold text-slate-950">我的频道状态</div>
          <p className="mb-0 mt-1 text-xs leading-6 text-slate-500">
            {readState
              ? `未读 ${readState.unreadCount} 条 · ${renderNotificationPreference(readState.notificationPreference)}`
              : "正在读取频道状态..."}
          </p>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          通知
          <select
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
            disabled={busyMemberId === "notification" || !readState}
            onChange={(event) => {
              void onUpdateNotificationPreference(
                event.target.value as ChannelNotificationPreference
              );
            }}
            value={readState?.notificationPreference ?? "all"}
          >
            <option value="all">全部消息</option>
            <option value="mentions_only">仅提到我</option>
            <option value="muted">静音</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3">
        {humanMembers.length > 0 ? (
          humanMembers.map((member) => (
            <MemberCard
              busy={busyMemberId === member.memberId}
              description={renderHumanMemberDescription(member)}
              key={member.memberId}
              member={member}
              name={member.displayName}
              onRemove={member.role === "owner" ? undefined : () => onRemoveMember(member)}
              onUpdatePermission={(permission) => onUpdateHumanPermission(member, permission)}
            />
          ))
        ) : (
          <p className="m-0 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-500">
            还没有邀请其他同事。
          </p>
        )}
        {aiMembers.length > 0 ? (
          aiMembers.map((member) => (
            <MemberCard
              busy={busyMemberId === member.memberId}
              description={renderAiMemberDescription(member)}
              key={member.memberId}
              member={member}
              name={member.displayName}
              onRemove={() => onRemoveMember(member)}
            />
          ))
        ) : (
          <p className="m-0 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-500">
            还没有 AI 同事参与这个频道。
          </p>
        )}
      </div>
    </aside>
  );
}

function MemberCard({
  busy = false,
  description,
  initial,
  member,
  name,
  onRemove,
  onUpdatePermission
}: {
  busy?: boolean;
  description: string;
  initial?: string;
  member: ChannelMember;
  name: string;
  onRemove?: () => void;
  onUpdatePermission?: (permission: "comment" | "read") => void;
}) {
  return (
    <article className="grid gap-3 rounded-[22px] border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
        {initial ?? name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-950">{name}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
        {onRemove ? (
          <button
            aria-label={`移除${name}`}
            className="rounded-full border border-red-100 bg-red-50 px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onRemove}
            type="button"
          >
            ×
          </button>
        ) : null}
      </div>
      {member.kind === "human" && member.role !== "owner" && member.status === "active" && onUpdatePermission ? (
        <select
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"
          disabled={busy}
          onChange={(event) => {
            onUpdatePermission(event.target.value === "read" ? "read" : "comment");
          }}
          value={member.permission === "read" ? "read" : "comment"}
        >
          <option value="comment">可发言</option>
          <option value="read">只读</option>
        </select>
      ) : null}
    </article>
  );
}

function normalizeChannelMembers(participants: ConversationAgentMember[]): ChannelMember[] {
  const membersById = new Map<string, ChannelMember>();

  for (const participant of participants) {
    if (!membersById.has(participant.agentId)) {
      membersById.set(participant.agentId, {
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
      });
    }
  }

  return [...membersById.values()];
}

function renderHumanMemberDescription(member: ChannelMember): string {
  if (member.kind !== "human") {
    return "";
  }

  if (member.status === "pending") {
    return "待加入";
  }

  if (member.role === "owner") {
    return "频道所有者";
  }

  return member.permission === "read" ? "只读同事" : "可发言同事";
}

function renderAiMemberDescription(member: ChannelMember): string {
  if (member.kind !== "ai") {
    return "";
  }

  if (member.status === "running") {
    return "AI 同事 · 工作中";
  }

  if (member.status === "disabled") {
    return "AI 同事 · 已停用";
  }

  return "AI 同事 · 可协作";
}

function renderNotificationPreference(value: ChannelNotificationPreference): string {
  switch (value) {
    case "all":
      return "全部消息";
    case "mentions_only":
      return "仅提到我";
    case "muted":
      return "静音";
  }
}

function RecoveryActions({
  channelId,
  failedActivity,
  onRefresh
}: {
  channelId: string;
  failedActivity: ActivityRound[];
  onRefresh: () => void;
}) {
  return (
    <section className="grid gap-3 rounded-[28px] border border-red-100 bg-red-50/70 p-5">
      <div>
        <h2 className="m-0 text-lg font-semibold text-red-950">需要恢复的执行</h2>
        <p className="mb-0 mt-2 text-sm leading-7 text-red-800">
          这里列出失败活动，并提供可操作的恢复入口。
        </p>
      </div>
      {failedActivity.map((round) => (
        <article key={round.id} className="grid gap-3 rounded-[22px] border border-red-100 bg-white/90 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong className="text-slate-950">{round.summary}</strong>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              执行失败
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <button className={recoveryActionClassName} onClick={onRefresh} type="button">
              重试刷新
            </button>
            <Link className={recoveryLinkClassName} href={`/channels/${channelId}?tab=chat`}>
              查看详情
            </Link>
            <Link className={recoveryLinkClassName} href="/settings?section=model-connections">
              检查模型连接
            </Link>
            <Link className={recoveryLinkClassName} href="/tasks">
              创建恢复任务
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}

function SurfaceEmpty({ body, title }: { body: string; title: string }) {
  return (
    <article className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-6 text-sm leading-7 text-slate-600">
      <strong className="text-slate-950">{title}</strong>
      <p className="mb-0 mt-2">{body}</p>
    </article>
  );
}

function renderApprovalStatus(status: ApprovalRequest["status"]) {
  switch (status) {
    case "pending":
      return "待处理";
    case "approved":
      return "已批准";
    case "rejected":
      return "已拒绝";
    case "revision_requested":
      return "要求修改";
  }
}

const recoveryActionClassName =
  "rounded-full border border-red-100 bg-white px-3 py-1 text-red-700 transition hover:bg-red-50";
const recoveryLinkClassName =
  "rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 no-underline transition hover:bg-slate-50";

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
}
