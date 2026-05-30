"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type {
  ActivityRound,
  Artifact,
  ApprovalRequest,
  ChannelSummary,
  Conversation,
  ConversationAgentMember,
  CodingWorkflowDecision,
  CodingWorkflowDetail,
  FileSurfaceEntry,
  Message,
  OrchestratorStatusEventPayload
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { ChatComposer } from "../chat/chat-composer";
import { ChatThread } from "../chat/chat-thread";
import { CodingWorkflowPanel } from "../chat/coding-workflow-panel";
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

type ChannelMember = Pick<ConversationAgentMember, "agentId" | "agentName">;

export function ChannelShell({ channelId, initialTab = "chat" }: ChannelShellProps) {
  const { activeWorkspaceId, isLoading, selectWorkspace, workspaces } = useActiveWorkspace();
  const activeTab = channelTabs.some((tab) => tab.id === initialTab) ? initialTab : "chat";
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId);
  const artifactsByMessageId: Record<string, Artifact[]> = {};
  const [busyDecision, setBusyDecision] = useState<CodingWorkflowDecision | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPinningMessageId, setIsPinningMessageId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [liveAssistantMessage, setLiveAssistantMessage] = useState<{
    content: string;
    id: string;
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
  const messages = useSurfaceData<Message[]>(
    isWorkspaceReady ? `/messages?conversationId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    []
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
    () => normalizeChannelMembers(channelParticipants),
    [channelParticipants]
  );
  const statusEvents = stream.events.flatMap((event) =>
    event.kind === "conversation.status" ? [event.payload as OrchestratorStatusEventPayload] : []
  );
  const failedActivity = activity.data.filter((round) => round.status === "failed");

  useEffect(() => {
    setTimelineMessages(messages.data);
    setLiveAssistantMessage((current) =>
      current && messages.data.some((message) => message.id === current.id) ? null : current
    );
  }, [messages.data]);

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
    content: string;
    mentionedAgentIds: string[];
  }): Promise<void> {
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await fetch(`${apiBaseUrl}/messages/send`, {
        body: JSON.stringify({
          content: input.content,
          conversationId: channelId,
          mentionedAgentIds: input.mentionedAgentIds,
          role: "user",
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

      startTransition(() => {
        setTimelineMessages((current) => [...current, payload as Message]);
      });
      schedulePostSendRefresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to send the message."
      );
    } finally {
      setIsSending(false);
    }
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
              messages={timelineMessages}
              onPinMessage={handlePinMessage}
              resolveAuthorLabel={resolveMessageAuthorLabel}
              statusEvents={statusEvents}
            />
            <ChatComposer
              disabled={isSending}
              onSend={handleSend}
              participants={channelParticipants}
            />
          </div>
          <ChannelMembersPanel channelId={channelId} members={channelMembers} />
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

function ChannelMembersPanel({
  channelId,
  members
}: {
  channelId: string;
  members: ChannelMember[];
}) {
  const returnTo = `/channels/${channelId}?tab=chat`;
  const createTeammateHref = `/teammates/new?channelId=${encodeURIComponent(
    channelId
  )}&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <aside
      aria-label="频道成员"
      className="grid gap-4 self-start rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-sm xl:sticky xl:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-slate-950">频道成员</h2>
          <p className="mb-0 mt-2 text-sm text-slate-500">
            1 位用户 + {members.length} 位 AI 同事
          </p>
        </div>
        <Link
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
          href={createTeammateHref}
        >
          新建同事
        </Link>
      </div>
      <div className="grid gap-3">
        <MemberCard description="当前用户" initial="我" name="你" />
        {members.length > 0 ? (
          members.map((member) => (
            <MemberCard
              key={member.agentId}
              description="AI 同事"
              name={member.agentName}
            />
          ))
        ) : (
          <p className="m-0 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-500">
            这个频道还没有添加 AI 同事。
          </p>
        )}
      </div>
    </aside>
  );
}

function MemberCard({
  description,
  initial,
  name
}: {
  description: string;
  initial?: string;
  name: string;
}) {
  return (
    <article className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-white p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
        {initial ?? name.slice(0, 1)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-950">{name}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
    </article>
  );
}

function normalizeChannelMembers(participants: ConversationAgentMember[]): ChannelMember[] {
  const membersById = new Map<string, ChannelMember>();

  for (const participant of participants) {
    if (!membersById.has(participant.agentId)) {
      membersById.set(participant.agentId, participant);
    }
  }

  return [...membersById.values()];
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
