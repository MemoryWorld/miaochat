"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  sanitizeAssistantVisibleContent,
  type ActivityRound,
  type Artifact,
  type ArtifactUploadTarget,
  type ApprovalRequest,
  type ChannelSummary,
  type ChannelMember,
  type ChannelMemberList,
  type ChannelNotificationPreference,
  type ChannelReadState,
  type Conversation,
  type ConversationAgentMember,
  type CodingWorkflowDecision,
  type CodingWorkflowDetail,
  type CodingWorkflowLaunchResponse,
  type FileSurfaceEntry,
  type Message,
  type MultiAgentRunLedger,
  type MessageThread,
  type OrchestratorStatusEventPayload,
  type VisualWorkflow,
  type WorkspaceMemberDirectoryEntry
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";
import {
  buildArtifactContentUrl,
  buildArtifactFileUrl,
  buildArtifactViewerUrl
} from "../artifacts/artifact-links";
import { AuthPanel } from "../auth/auth-panel";
import {
  mergeRuntimeArtifactStatus,
  type ArtifactStatusesByMessageId
} from "../chat/artifact-status";
import { ChatComposer } from "../chat/chat-composer";
import { ChatThread } from "../chat/chat-thread";
import { CodingWorkflowPanel } from "../chat/coding-workflow-panel";
import {
  createPendingAssistantMessage,
  shouldClearLiveAssistantMessage,
  type LiveAssistantMessage
} from "../chat/live-assistant-message";
import { PresenceBar } from "../chat/presence-bar";
import { MarkdownContent } from "../chat/markdown-content";
import { useConversationStream } from "../chat/use-conversation-stream";
import { useSurfaceData } from "../workspace-shell/use-surface-data";
import { VisualWorkflowPanel } from "../workflows/visual-workflow-panel";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";

const channelTabs = [
  { id: "chat", label: "聊天" },
  { id: "files", label: "文件" }
] as const;
const liveAssistantRefreshIntervalMs = 30_000;
const postSendRefreshDelaysMs = [1_200, 4_000, 8_000, 15_000, 30_000, 65_000, 90_000] as const;
const fileSurfaceRefreshDelaysMs = [0, ...postSendRefreshDelaysMs] as const;
const realtimeStreamConnectingMessage = "正在连接实时流，稍后即可发送。";

type ChannelShellProps = {
  channelId: string;
  initialTab?: string;
};

type SurfaceLoadSnapshot = {
  error: string | null;
  hasLoaded: boolean;
  hasSuccessfulLoad: boolean;
};

type MessageDispatchResponse = Message & {
  launchedCodingWorkflow?: CodingWorkflowLaunchResponse;
  launchedWorkflow?: VisualWorkflow;
};

export function ChannelShell({ channelId, initialTab = "chat" }: ChannelShellProps) {
  const router = useRouter();
  const {
    activeWorkspaceId,
    error: workspaceError,
    isLoading,
    refresh: refreshWorkspaces,
    requiresLogin,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const activeTab = channelTabs.some((tab) => tab.id === initialTab) ? initialTab : "chat";
  const isWorkspaceReady = !isLoading && Boolean(activeWorkspaceId) && !requiresLogin;
  const [artifactsByMessageId, setArtifactsByMessageId] = useState<Record<string, Artifact[]>>({});
  const [artifactStatusesByMessageId, setArtifactStatusesByMessageId] =
    useState<ArtifactStatusesByMessageId>({});
  const [busyDecision, setBusyDecision] = useState<CodingWorkflowDecision | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPinningMessageId, setIsPinningMessageId] = useState<string | null>(null);
  const [isPinnedDrawerOpen, setIsPinnedDrawerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [executingVisualWorkflowId, setExecutingVisualWorkflowId] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [channelSendUnavailableMessage, setChannelSendUnavailableMessage] =
    useState<string | null>(null);
  const [liveAssistantMessage, setLiveAssistantMessage] =
    useState<LiveAssistantMessage | null>(null);
  const [liveOrchestratorStatus, setLiveOrchestratorStatus] =
    useState<OrchestratorStatusEventPayload | null>(null);
  const [threadDrawer, setThreadDrawer] = useState<{
    error: string | null;
    isLoading: boolean;
    parent: Message;
    replies: Message[];
  } | null>(null);
  const [timelineMessages, setTimelineMessages] = useState<Message[]>([]);
  const [optimisticVisualWorkflows, setOptimisticVisualWorkflows] = useState<VisualWorkflow[]>([]);
  const fileSurfaceRefreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const postSendRefreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const processedStreamEventCountRef = useRef(0);
  const workspaceSurfaceResetKey = activeWorkspaceId;
  const channelSurfaceResetKey = `${activeWorkspaceId}:${channelId}`;
  const channels = useSurfaceData<ChannelSummary[]>(
    isWorkspaceReady ? `/channels?workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: workspaceSurfaceResetKey
    }
  );
  const conversations = useSurfaceData<Conversation[]>(
    isWorkspaceReady ? `/conversations?workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: workspaceSurfaceResetKey
    }
  );
  const channelRoster = useSurfaceData<ChannelMemberList | null>(
    isWorkspaceReady ? `/channels/${channelId}/members?workspaceId=${activeWorkspaceId}` : null,
    null,
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const workspaceDirectory = useSurfaceData<WorkspaceMemberDirectoryEntry[]>(
    isWorkspaceReady ? `/workspace-member-directory?workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: workspaceSurfaceResetKey
    }
  );
  const messages = useSurfaceData<Message[]>(
    isWorkspaceReady ? `/messages?conversationId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const readState = useSurfaceData<ChannelReadState | null>(
    isWorkspaceReady ? `/channels/${channelId}/read-state?workspaceId=${activeWorkspaceId}` : null,
    null,
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const files = useSurfaceData<FileSurfaceEntry[]>(
    isWorkspaceReady ? `/channel-files?channelId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const activity = useSurfaceData<ActivityRound[]>(
    isWorkspaceReady ? `/activity?channelId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const agentRuns = useSurfaceData<MultiAgentRunLedger[]>(
    isWorkspaceReady ? `/channels/${channelId}/agent-runs?workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const approvals = useSurfaceData<ApprovalRequest[]>(
    isWorkspaceReady ? `/approvals?channelId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const workflow = useSurfaceData<CodingWorkflowDetail | null>(
    isWorkspaceReady ? `/coding-workflows?conversationId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    null,
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const visualWorkflows = useSurfaceData<VisualWorkflow[]>(
    isWorkspaceReady ? `/visual-workflows?channelId=${channelId}&workspaceId=${activeWorkspaceId}` : null,
    [],
    {
      preserveDataOnError: true,
      preserveDataWhenDisabled: true,
      resetKey: channelSurfaceResetKey
    }
  );
  const stream = useConversationStream({
    conversationId: channelId,
    enabled: isWorkspaceReady,
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
  const channelLoadError = channelRoster.error ?? messages.error ?? readState.error;
  const channelLookupError = channels.error ?? conversations.error;
  const isChannelLookupLoading = channels.isLoading || conversations.isLoading;
  const hasChannelEvidence = Boolean(
    channel ||
      conversation ||
      channelRoster.data ||
      messages.data.length > 0 ||
      files.data.length > 0 ||
      activity.data.length > 0 ||
      workflow.data ||
      visualWorkflows.data.length > 0 ||
      optimisticVisualWorkflows.length > 0
  );
  const isChannelMissing =
    isWorkspaceReady &&
    !isChannelLookupLoading &&
    channels.hasSuccessfulLoad &&
    conversations.hasSuccessfulLoad &&
    !hasChannelEvidence &&
    !channel &&
    !conversation;
  const channelAvailabilityMessage =
    channelSendUnavailableMessage ??
    buildChannelAvailabilityMessage(channelLoadError ?? channelLookupError, isChannelMissing);
  const isChannelUnavailable = Boolean(channelAvailabilityMessage);
  const isComposerWaitingForStream =
    isWorkspaceReady && !isChannelUnavailable && stream.connectionState === "connecting";
  const composerDisabled = isSending || !isWorkspaceReady || isChannelUnavailable;
  const channelRefreshErrorMessage = buildChannelRefreshErrorMessage(
    channelLoadError ?? channelLookupError
  );
  const visibleErrorMessage =
    channelAvailabilityMessage ? null : errorMessage ?? channelRefreshErrorMessage;
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
  const visibleChannelMembers = isChannelUnavailable ? [] : channelMembers;
  const visibleTimelineMessages = isChannelUnavailable ? [] : timelineMessages;
  const isWorkspaceHydrating = !requiresLogin && !isWorkspaceReady;
  const isMessagesHydrating =
    !isChannelUnavailable &&
    visibleTimelineMessages.length === 0 &&
    (isWorkspaceHydrating || isAwaitingFirstSurfaceLoad(messages));
  const isMembersHydrating =
    !isChannelUnavailable &&
    !channelRoster.data &&
    visibleChannelMembers.length === 0 &&
    (isWorkspaceHydrating || isAwaitingFirstSurfaceLoad(channelRoster));
  const isOverviewHydrating =
    !isChannelUnavailable &&
    (isWorkspaceHydrating ||
      (!channel && isAwaitingFirstSurfaceLoad(channels)) ||
      (!conversation && isAwaitingFirstSurfaceLoad(conversations)) ||
      (isAwaitingFirstSurfaceLoad(channelRoster) &&
        !channelRoster.data &&
        channelParticipants.length === 0 &&
        (channel?.memberTeammateIds.length ?? 0) === 0) ||
      (approvals.data.length === 0 && isAwaitingFirstSurfaceLoad(approvals)) ||
      (activity.data.length === 0 && isAwaitingFirstSurfaceLoad(activity)) ||
      (visualWorkflows.data.length === 0 && isAwaitingFirstSurfaceLoad(visualWorkflows)));
  const isPreviewHydrating =
    !isChannelUnavailable &&
    files.data.length === 0 &&
    (isWorkspaceHydrating ||
      isAwaitingFirstSurfaceLoad(files) ||
      (!workflow.data && isAwaitingFirstSurfaceLoad(workflow)) ||
      (visualWorkflows.data.length === 0 && isAwaitingFirstSurfaceLoad(visualWorkflows)) ||
      (activity.data.length === 0 && isAwaitingFirstSurfaceLoad(activity)) ||
      isMessagesHydrating);
  const isFilesTabHydrating =
    !isChannelUnavailable &&
    files.data.length === 0 &&
    (isWorkspaceHydrating || isAwaitingFirstSurfaceLoad(files));
  const failedActivity = activity.data.filter((round) => round.status === "failed");
  const pinnedMessages = useMemo(
    () => visibleTimelineMessages.filter((message) => message.isPinned),
    [visibleTimelineMessages]
  );
  const displayedMessages = useMemo(() => {
    const query = messageSearchQuery.trim().toLowerCase();

    if (!query) {
      return visibleTimelineMessages;
    }

    return visibleTimelineMessages.filter((message) => {
      const authorLabel = resolveMessageAuthorLabel(message) ?? "";
      const visibleContent = getVisibleMessageContent(message);

      return (
        visibleContent.toLowerCase().includes(query) ||
        authorLabel.toLowerCase().includes(query)
      );
    });
  }, [messageSearchQuery, visibleTimelineMessages]);
  const availableAiMembers = useMemo(
    () =>
      visibleChannelMembers.filter(
        (member): member is Extract<ChannelMember, { kind: "ai" }> =>
          member.kind === "ai" && member.status === "available"
      ),
    [visibleChannelMembers]
  );
  const restoredLiveAssistantMessage = useMemo<LiveAssistantMessage | null>(() => {
    if (liveAssistantMessage) {
      return null;
    }

    const latestMessage = visibleTimelineMessages.at(-1);

    if (!latestMessage || latestMessage.role !== "user") {
      return null;
    }

    const latestMessageTime = new Date(latestMessage.createdAt).getTime();
    const hasActiveRun = agentRuns.data.some((run) => {
      if (run.status !== "running") {
        return false;
      }

      const runUpdatedAt = new Date(run.updatedAt).getTime();

      return Number.isFinite(runUpdatedAt) && runUpdatedAt >= latestMessageTime - 5_000;
    });

    return hasActiveRun
      ? {
          content: "",
          id: `agent-runs:${latestMessage.id}`,
          userMessageId: latestMessage.id
        }
      : null;
  }, [agentRuns.data, liveAssistantMessage, visibleTimelineMessages]);
  const visibleLiveAssistantMessage = liveAssistantMessage ?? restoredLiveAssistantMessage;
  const restoredOrchestratorStatus = useMemo<OrchestratorStatusEventPayload | null>(() => {
    if (liveOrchestratorStatus || liveAssistantMessage) {
      return null;
    }

    const latestMessage = visibleTimelineMessages.at(-1);

    if (!latestMessage || latestMessage.role !== "user") {
      return null;
    }

    const latestMessageTime = new Date(latestMessage.createdAt).getTime();
    const activeRuns = agentRuns.data.filter((run) => {
      if (run.status !== "running") {
        return false;
      }

      const runUpdatedAt = new Date(run.updatedAt).getTime();

      return Number.isFinite(runUpdatedAt) && runUpdatedAt >= latestMessageTime - 5_000;
    });
    const activeRun = activeRuns[0];

    if (!activeRun) {
      return null;
    }

    const activeAgentName =
      channelParticipants.find((entry) => entry.agentId === activeRun.agentId)?.agentName ??
      workflow.data?.teammates.find((entry) => entry.agentId === activeRun.agentId)?.name ??
      "AI 同事";

    return {
      activeAgentName,
      failures: [],
      label: "orchestrator.running",
      state: "running",
      successfulAgentCount: 0,
      summary: `${activeAgentName}正在处理，最近进度：${formatAgentRunCheckpoint(activeRun.checkpoint)}。`,
      totalAgentCount: Math.max(activeRuns.length, channelParticipants.length, 1)
    };
  }, [
    agentRuns.data,
    channelParticipants,
    liveAssistantMessage,
    liveOrchestratorStatus,
    visibleTimelineMessages,
    workflow.data?.teammates
  ]);
  const visibleOrchestratorStatus = liveOrchestratorStatus ?? restoredOrchestratorStatus;
  const visibleVisualWorkflows = useMemo(
    () => mergeVisualWorkflows(visualWorkflows.data, optimisticVisualWorkflows),
    [optimisticVisualWorkflows, visualWorkflows.data]
  );

  useEffect(() => {
    setTimelineMessages(messages.data);
    setLiveAssistantMessage((current) =>
      shouldClearLiveAssistantMessage(current, messages.data) ? null : current
    );
    setLiveOrchestratorStatus((current) =>
      current && shouldClearLiveStatus(messages.data) ? null : current
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
    clearFileSurfaceRefreshTimers();
    clearPostSendRefreshTimers();
    setChannelSendUnavailableMessage(null);
    setErrorMessage(null);
    setLiveAssistantMessage(null);
    setArtifactsByMessageId({});
    setArtifactStatusesByMessageId({});
    setOptimisticVisualWorkflows([]);
    setExecutingVisualWorkflowId(null);
    setThreadDrawer(null);
  }, [channelId]);

  useEffect(
    () => () => {
      clearFileSurfaceRefreshTimers();
      clearPostSendRefreshTimers();
    },
    []
  );

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
          setLiveOrchestratorStatus(null);
          setLiveAssistantMessage((current) => ({
            content: "",
            id: event.payload.messageId,
            isComplete: false,
            userMessageId: current?.userMessageId
          }));
          return;
        }

        if (event.kind === "conversation.message.delta") {
          setLiveAssistantMessage((current) => ({
            content:
              current?.id === event.payload.messageId
                ? `${current.content}${event.payload.delta}`
                : event.payload.delta,
            id: event.payload.messageId,
            isComplete: false,
            userMessageId: current?.userMessageId
          }));
          return;
        }

        if (event.kind === "conversation.message.completed") {
          setLiveOrchestratorStatus(null);
          setLiveAssistantMessage((current) => ({
            content: event.payload.finalContent,
            id: event.payload.messageId,
            isComplete: true,
            userMessageId: current?.userMessageId
          }));
          void messages.refresh();
          schedulePostSendRefresh();
          return;
        }

        if (event.kind === "conversation.status") {
          setLiveOrchestratorStatus(
            event.payload.state === "running" ? event.payload : null
          );

          if (event.payload.artifactStatus) {
            const { artifactStatus } = event.payload;
            setArtifactStatusesByMessageId((current) =>
              mergeRuntimeArtifactStatus(current, artifactStatus)
            );

            if (artifactStatus.status === "created") {
              void refreshArtifactsForMessageIds([artifactStatus.messageId]);
              scheduleFileSurfaceRefresh();
            }
          } else {
            schedulePostSendRefresh();
          }
        }
      });
    }
  }, [files.refresh, messages.refresh, stream.events]);

  useEffect(() => {
    if (!activeWorkspaceId || !visibleLiveAssistantMessage) {
      return;
    }

    const timer = setInterval(() => {
      void messages.refresh();
    }, liveAssistantRefreshIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [activeWorkspaceId, messages.refresh, visibleLiveAssistantMessage?.id]);

  useEffect(() => {
    if (!activeWorkspaceId || !hasRunningChannelWork({
      agentRuns: agentRuns.data,
      liveStatus: visibleOrchestratorStatus,
      workflow: workflow.data
    })) {
      return;
    }

    const timer = setInterval(() => {
      void refreshChannelSurfaces();
    }, 10_000);

    return () => {
      clearInterval(timer);
    };
  }, [
    activeWorkspaceId,
    activity.refresh,
    agentRuns.data,
    agentRuns.refresh,
    conversations.refresh,
    files.refresh,
    messages.refresh,
    visibleOrchestratorStatus,
    visualWorkflows.refresh,
    workflow.data,
    workflow.refresh
  ]);

  useEffect(() => {
    if (!liveAssistantMessage || stream.connectionState !== "connecting") {
      return;
    }

    void messages.refresh();
  }, [liveAssistantMessage?.id, messages.refresh, stream.connectionState]);

  async function handleDecision(input: {
    decision: CodingWorkflowDecision;
    note: string;
  }): Promise<void> {
    if (!workflow.data) {
      return;
    }

    setBusyDecision(input.decision);

    try {
      const response = await fetch(`${apiBaseUrl}/coding-workflows/${workflow.data.id}/decisions`, {
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
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "更新计划审批失败。"));
      }
      await Promise.all([
        workflow.refresh(),
        approvals.refresh(),
        activity.refresh(),
        messages.refresh(),
        files.refresh()
      ]);
      schedulePostSendRefresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "更新计划审批失败。");
    } finally {
      setBusyDecision(null);
    }
  }

  async function handleExecuteVisualWorkflow(targetWorkflow: VisualWorkflow): Promise<void> {
    if (!activeWorkspaceId) {
      setErrorMessage("请先选择工作区后再执行 workflow。");
      return;
    }

    setErrorMessage(null);
    setExecutingVisualWorkflowId(targetWorkflow.id);
    setOptimisticVisualWorkflows((current) =>
      mergeVisualWorkflows([
        {
          ...targetWorkflow,
          status: "running"
        }
      ], current)
    );

    try {
      const response = await fetch(
        `${apiBaseUrl}/visual-workflows/${encodeURIComponent(targetWorkflow.id)}/runs`,
        {
          body: JSON.stringify({
            inputValues: {},
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
        throw new Error(readErrorMessage(payload, "执行 workflow 失败。"));
      }

      const executedWorkflow = payload as VisualWorkflow;
      setOptimisticVisualWorkflows((current) =>
        mergeVisualWorkflows([executedWorkflow], current)
      );
      await Promise.all([
        visualWorkflows.refresh(),
        files.refresh(),
        messages.refresh()
      ]);
      scheduleFileSurfaceRefresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "执行 workflow 失败。");
    } finally {
      setExecutingVisualWorkflowId(null);
    }
  }

  async function handleRegenerateVisualWorkflow(targetWorkflow: VisualWorkflow): Promise<void> {
    await mutateVisualWorkflow(targetWorkflow, "regenerate", "重新生成 workflow 失败。");
  }

  async function handleCancelVisualWorkflow(targetWorkflow: VisualWorkflow): Promise<void> {
    await mutateVisualWorkflow(targetWorkflow, "cancel", "取消 workflow 失败。");
  }

  async function mutateVisualWorkflow(
    targetWorkflow: VisualWorkflow,
    action: "cancel" | "regenerate",
    fallbackError: string
  ): Promise<void> {
    if (!activeWorkspaceId) {
      setErrorMessage("请先选择工作区后再继续操作。");
      return;
    }

    setErrorMessage(null);
    setExecutingVisualWorkflowId(targetWorkflow.id);

    try {
      const response = await fetch(
        `${apiBaseUrl}/visual-workflows/${encodeURIComponent(targetWorkflow.id)}/${action}`,
        {
          body: JSON.stringify({
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
        throw new Error(readErrorMessage(payload, fallbackError));
      }

      const nextWorkflow = payload as VisualWorkflow;
      setOptimisticVisualWorkflows((current) =>
        mergeVisualWorkflows([nextWorkflow], current)
      );
      await visualWorkflows.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : fallbackError);
    } finally {
      setExecutingVisualWorkflowId(null);
    }
  }

  async function handleSend(input: {
    attachments: File[];
    content: string;
    mentionedAgentIds: string[];
    mentionedUserIds: string[];
    threadParentMessageId?: string | null;
  }): Promise<boolean> {
    if (channelAvailabilityMessage || !activeWorkspaceId) {
      setErrorMessage(channelAvailabilityMessage ?? "请先选择工作区后再发送消息。");
      return false;
    }

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
        const nextErrorMessage = readErrorMessage(payload, "发送消息失败。");
        if (response.status === 404) {
          setChannelSendUnavailableMessage(normalizeChannelErrorMessage(nextErrorMessage));
        }
        throw new Error(nextErrorMessage);
      }

      const message = payload as MessageDispatchResponse;
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
          if (message.launchedWorkflow) {
            setOptimisticVisualWorkflows((current) =>
              mergeVisualWorkflows([message.launchedWorkflow as VisualWorkflow], current)
            );
            setLiveAssistantMessage(null);
            setLiveOrchestratorStatus(null);
          } else if (message.launchedCodingWorkflow) {
            setLiveAssistantMessage(null);
            setLiveOrchestratorStatus(null);
          } else if (shouldExpectAssistantReply()) {
            setLiveAssistantMessage(createPendingAssistantMessage(message.id));
          }
        }
      });
      if (message.launchedWorkflow) {
        clearPostSendRefreshTimers();
        await Promise.all([visualWorkflows.refresh(), files.refresh(), messages.refresh()]);
        router.push(
          `/workflows/${message.launchedWorkflow.id}?workspaceId=${encodeURIComponent(activeWorkspaceId)}`
        );
        if (input.attachments.length > 0) {
          await createArtifactsForMessage(message, input.attachments);
        }
        return true;
      }
      if (message.launchedCodingWorkflow) {
        clearPostSendRefreshTimers();
        router.push(`/channels/${message.launchedCodingWorkflow.conversation.id}?tab=chat`);
        if (input.attachments.length > 0) {
          await createArtifactsForMessage(message, input.attachments);
        }
        return true;
      }
      schedulePostSendRefresh();
      if (input.attachments.length > 0) {
        await createArtifactsForMessage(message, input.attachments);
      }
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "发送消息失败。"
      );
      return false;
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

  function shouldExpectAssistantReply(): boolean {
    return availableAiMembers.length > 0 || channelParticipants.length > 0;
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
  }): Promise<boolean> {
    if (!threadDrawer) {
      return false;
    }

    return handleSend({
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
    await refreshArtifactsForMessageIds(nextMessages.map((message) => message.id));
  }

  async function refreshArtifactsForMessageIds(messageIds: string[]): Promise<void> {
    if (!activeWorkspaceId || messageIds.length === 0) {
      return;
    }

    const uniqueMessageIds = Array.from(new Set(messageIds));
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

  function clearFileSurfaceRefreshTimers(): void {
    for (const timer of fileSurfaceRefreshTimersRef.current) {
      clearTimeout(timer);
    }
    fileSurfaceRefreshTimersRef.current = [];
  }

  function scheduleFileSurfaceRefresh(): void {
    clearFileSurfaceRefreshTimers();
    fileSurfaceRefreshTimersRef.current = fileSurfaceRefreshDelaysMs.map((delay) =>
      setTimeout(() => {
        void files.refresh();
      }, delay)
    );
  }

  function schedulePostSendRefresh(): void {
    clearPostSendRefreshTimers();
    postSendRefreshTimersRef.current = postSendRefreshDelaysMs.map((delay) =>
      setTimeout(() => {
        void refreshChannelSurfaces();
      }, delay)
    );
  }

  async function refreshChannelSurfaces(): Promise<void> {
    await Promise.all([
      messages.refresh(),
      files.refresh(),
      activity.refresh(),
      workflow.refresh(),
      visualWorkflows.refresh(),
      agentRuns.refresh(),
      conversations.refresh()
    ]);
  }

  async function handleTogglePinMessage(message: Message): Promise<void> {
    const nextAction = message.isPinned ? "unpin" : "pin";
    const fallbackMessage = message.isPinned
      ? "取消置顶消息失败。"
      : "置顶选中消息失败。";

    setErrorMessage(null);
    setIsPinningMessageId(message.id);

    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${message.id}/${nextAction}?workspaceId=${activeWorkspaceId}`,
        {
          credentials: "include",
          method: "POST"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, fallbackMessage));
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
        error instanceof Error ? error.message : fallbackMessage
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
        requiresLogin ? (
          <div className="grid gap-4">
            <div>
              <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
                需要登录
              </h1>
              <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                登录后即可恢复当前频道、消息和文件产物。
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div>
              <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">
                {channel?.title ?? conversation?.title ?? (isChannelUnavailable ? "频道不可用" : "正在加载频道")}
              </h1>
              <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
                {channel?.summary ??
                  (isChannelUnavailable
                    ? "当前频道无法继续使用，请从频道列表选择其他频道。"
                    : "消息、文件、审批和活动都围绕这个频道持续沉淀。")}
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
              {isOverviewHydrating ? (
                <div>正在同步频道概况...</div>
              ) : (
                <>
                  <div>AI 同事：{channel?.memberTeammateIds.length ?? channelParticipants.length}</div>
                  <div>审批：{approvals.data.length}</div>
                  <div>活动轮次：{activity.data.length}</div>
                  {failedActivity.length > 0 ? (
                    <div className="font-semibold text-red-700">需要处理：{failedActivity.length}</div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )
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
      {requiresLogin ? (
        <section className="mx-auto grid w-full max-w-xl gap-4">
          <article
            className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900"
            role="alert"
          >
            {workspaceError ?? "请先登录后再继续操作。"}
          </article>
          <AuthPanel onAuthenticated={() => void refreshWorkspaces()} />
        </section>
      ) : activeTab === "chat" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem_24rem]">
          <div className="grid min-w-0 gap-4">
            {channelAvailabilityMessage ? (
              <section
                className="grid gap-2 rounded-[24px] border border-red-100 bg-red-50/80 p-4 text-sm leading-7 text-red-800"
                role="alert"
              >
                <h2 className="m-0 text-base font-semibold text-red-950">频道不可用</h2>
                <p className="m-0">
                  {channelAvailabilityMessage} 无法继续发送消息，请从频道列表选择可用频道。
                </p>
              </section>
            ) : null}
            {visibleErrorMessage ? (
              <p className="m-0 text-sm font-medium text-red-700">{visibleErrorMessage}</p>
            ) : null}
            {workflow.data ? (
              <CodingWorkflowPanel
                busyDecision={busyDecision}
                messages={messages.data}
                onDecision={handleDecision}
                workflow={workflow.data}
              />
            ) : null}
            {visibleVisualWorkflows.length > 0 ? (
              <VisualWorkflowPanel
                busyWorkflowId={executingVisualWorkflowId}
                onCancel={handleCancelVisualWorkflow}
                onExecute={handleExecuteVisualWorkflow}
                onRegenerate={handleRegenerateVisualWorkflow}
                workflows={visibleVisualWorkflows}
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
                    {isMessagesHydrating
                      ? "正在同步频道消息..."
                      : `${displayedMessages.length} 条可见消息 · ${pinnedMessages.length} 条已置顶 · 未读 ${readState.data?.unreadCount ?? 0} 条`}
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
                    disabled={composerDisabled || availableAiMembers.length === 0}
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
                        ：{getVisibleMessageContent(message).slice(0, 80)}
                      </a>
                    ))
                  ) : (
                    <p className="m-0 text-sm text-slate-500">当前还没有置顶消息。</p>
                  )}
                </div>
              ) : null}
              {activeWorkspaceId ? (
                !isChannelUnavailable ? (
                  <PresenceBar conversationId={channelId} workspaceId={activeWorkspaceId} />
                ) : null
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
              artifactStatusesByMessageId={artifactStatusesByMessageId}
              connectionState={stream.connectionState}
              deployments={[]}
              isPinningMessageId={isPinningMessageId}
              liveAssistantMessage={visibleLiveAssistantMessage}
              liveStatus={visibleOrchestratorStatus}
              messages={displayedMessages}
              isLoading={messages.isLoading || isMessagesHydrating}
              onReplyMessage={handleOpenThread}
              onTogglePinMessage={handleTogglePinMessage}
              resolveAuthorLabel={resolveMessageAuthorLabel}
              suppressEmptyState={!isWorkspaceReady || isChannelUnavailable || isMessagesHydrating}
            />
            {threadDrawer && !isChannelUnavailable ? (
              <ThreadDrawer
                artifactsByMessageId={artifactsByMessageId}
                artifactStatusesByMessageId={artifactStatusesByMessageId}
                channelMembers={visibleChannelMembers}
                isSending={isSending}
                onClose={() => setThreadDrawer(null)}
                onSendReply={handleSendThreadReply}
                onTogglePinMessage={handleTogglePinMessage}
                resolveAuthorLabel={resolveMessageAuthorLabel}
                thread={threadDrawer}
              />
            ) : null}
            <ChatComposer
              disabled={composerDisabled}
              disabledReason={
                isComposerWaitingForStream ? realtimeStreamConnectingMessage : null
              }
              members={visibleChannelMembers}
              onSend={handleSend}
              onTyping={handleTyping}
              participants={isChannelUnavailable ? [] : channelParticipants}
              submitDisabled={isComposerWaitingForStream}
            />
          </div>
          <ChannelMembersPanel
            actionError={memberActionError}
            busyMemberId={memberActionId}
            channelId={channelId}
            directory={isChannelUnavailable ? [] : workspaceDirectory.data}
            isHydrating={isMembersHydrating}
            isLoading={!isChannelUnavailable && channelRoster.isLoading}
            members={visibleChannelMembers}
            onInviteHumans={handleInviteHumanMembers}
            onRemoveMember={handleRemoveMember}
            onUpdateNotificationPreference={handleUpdateNotificationPreference}
            onUpdateHumanPermission={handleUpdateHumanPermission}
            readState={isChannelUnavailable ? null : readState.data}
            roster={isChannelUnavailable ? null : channelRoster.data}
          />
          <ChannelArtifactPreviewPanel
            activity={activity.data}
            error={files.error}
            files={files.data}
            isHydrating={isPreviewHydrating}
            isLoading={files.isLoading}
            liveStatus={visibleOrchestratorStatus}
            onRefresh={() => {
              void files.refresh();
            }}
            workflow={workflow.data}
          />
        </div>
      ) : (
        <section className="grid gap-3">
          {isFilesTabHydrating ? (
            <SurfaceLoading body="正在同步当前频道的文件产物。" title="正在加载文件" />
          ) : files.error && files.data.length === 0 ? (
            <p className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
              {files.error}
            </p>
          ) : files.data.length === 0 ? (
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
                {renderFileSurfaceActions(file)}
              </article>
            ))
          )}
        </section>
      )}
    </AppShell>
  );
}

function isMarkdownFile(file: FileSurfaceEntry): boolean {
  return file.mimeType.toLowerCase().includes("markdown");
}

function mergeVisualWorkflows(
  base: VisualWorkflow[],
  overlays: VisualWorkflow[]
): VisualWorkflow[] {
  const merged = new Map<string, VisualWorkflow>();

  for (const workflow of [...base, ...overlays]) {
    const current = merged.get(workflow.id);
    if (!current || new Date(workflow.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      merged.set(workflow.id, workflow);
    }
  }

  return [...merged.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function isAwaitingFirstSurfaceLoad(surface: SurfaceLoadSnapshot): boolean {
  return !surface.error && !surface.hasLoaded && !surface.hasSuccessfulLoad;
}

function isHtmlFile(file: FileSurfaceEntry): boolean {
  const mimeType = file.mimeType.toLowerCase();

  return mimeType.includes("html") || /\.html?$/i.test(file.title);
}

function renderFileSurfaceActions(file: FileSurfaceEntry) {
  const openHref = getFileSurfaceOpenHref(file);
  const downloadHref = getFileSurfaceDownloadHref(file);

  if (!openHref && !downloadHref) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {openHref ? (
        <a
          aria-label={`打开 ${file.title}${isMarkdownFile(file) ? " Markdown" : isHtmlFile(file) ? " 网页" : " 预览"}`}
          className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 no-underline transition hover:bg-sky-100"
          href={openHref}
          rel="noreferrer"
          target="_blank"
        >
          {getFileSurfaceOpenLabel(file)}
        </a>
      ) : null}
      {downloadHref ? (
        <a
          aria-label={`下载 ${file.title}`}
          className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          href={downloadHref}
          rel="noreferrer"
          target="_blank"
        >
          下载
        </a>
      ) : null}
    </div>
  );
}

function getFileSurfaceOpenHref(file: FileSurfaceEntry): string | null {
  if (file.storageKey) {
    return isMarkdownFile(file)
      ? buildArtifactViewerUrl(file.id, file.workspaceId)
      : buildArtifactFileUrl(file.id, file.workspaceId, "inline");
  }

  return file.previewUrl ?? null;
}

function getFileSurfaceDownloadHref(file: FileSurfaceEntry): string | null {
  if (file.storageKey) {
    return buildArtifactFileUrl(file.id, file.workspaceId, "attachment");
  }

  return file.previewUrl ?? null;
}

function getFileSurfaceOpenLabel(file: FileSurfaceEntry): string {
  if (isMarkdownFile(file)) {
    return "打开 Markdown";
  }

  if (isHtmlFile(file)) {
    return "打开网页";
  }

  return "打开预览";
}

type ArtifactPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { message: string; status: "error" }
  | {
      content: string;
      mimeType: string;
      title: string;
      truncated: boolean;
      status: "ready";
    };

function ChannelArtifactPreviewPanel({
  activity,
  error,
  files,
  isHydrating,
  isLoading,
  liveStatus,
  onRefresh,
  workflow
}: {
  activity: ActivityRound[];
  error: string | null;
  files: FileSurfaceEntry[];
  isHydrating: boolean;
  isLoading: boolean;
  liveStatus: OrchestratorStatusEventPayload | null;
  onRefresh: () => void;
  workflow: CodingWorkflowDetail | null;
}) {
  const selectedFile = useMemo(() => selectPreviewFile(files), [files]);
  const latestRunningActivity = useMemo(
    () => [...activity].reverse().find((round) => round.status === "running") ?? null,
    [activity]
  );
  const [state, setState] = useState<ArtifactPreviewState>({ status: "idle" });

  useEffect(() => {
    if (!selectedFile || (!isHtmlFile(selectedFile) && !isMarkdownFile(selectedFile))) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    fetch(buildArtifactContentUrl(selectedFile.id, selectedFile.workspaceId), {
      credentials: "include",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`产物预览加载失败（${response.status}）。`);
        }

        return parseArtifactContent(await response.json());
      })
      .then((content) => {
        setState({
          ...content,
          status: "ready"
        });
      })
      .catch((loadError) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          message: loadError instanceof Error ? loadError.message : "产物预览加载失败。",
          status: "error"
        });
      });

    return () => controller.abort();
  }, [selectedFile?.id, selectedFile?.workspaceId]);

  const progressSummary =
    liveStatus?.summary ??
    latestRunningActivity?.summary ??
    workflowStatusSummary(workflow);
  const activeAgentName =
    liveStatus?.activeAgentName ??
    latestRunningActivity?.actingTeammateName ??
    null;
  const selectedOpenHref = selectedFile ? getFileSurfaceOpenHref(selectedFile) : null;
  const selectedDownloadHref = selectedFile ? getFileSurfaceDownloadHref(selectedFile) : null;

  return (
    <aside
      aria-label="网页预览"
      className="grid max-h-[calc(100vh-3rem)] min-h-[32rem] gap-3 self-start overflow-hidden rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm xl:sticky xl:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-slate-950">网页预览</h2>
          <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">
            {selectedFile
              ? selectedFile.title
              : isHydrating
                ? "正在同步网页预览..."
                : "等待工程师生成真实 HTML 产物"}
          </p>
        </div>
        <button
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onRefresh}
          type="button"
        >
          刷新
        </button>
      </div>

      {error ? (
        <p className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {selectedFile ? (
        <div className="flex flex-wrap gap-2">
          {selectedOpenHref ? (
            <a
              className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 no-underline transition hover:bg-sky-100"
              href={selectedOpenHref}
              rel="noreferrer"
              target="_blank"
            >
              {isMarkdownFile(selectedFile) ? "打开 Markdown" : "打开全屏"}
            </a>
          ) : null}
          {selectedDownloadHref ? (
            <a
              className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
              href={selectedDownloadHref}
              rel="noreferrer"
              target="_blank"
            >
              下载
            </a>
          ) : null}
        </div>
      ) : null}

      {state.status === "loading" || ((isLoading || isHydrating) && !selectedFile) ? (
        <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {isHydrating && !selectedFile ? "正在同步网页预览..." : "正在加载预览..."}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" && selectedFile && isHtmlFile(selectedFile) ? (
        <iframe
          className="min-h-[26rem] w-full rounded-lg border border-slate-200 bg-white"
          data-channel-webpage-preview
          sandbox="allow-scripts"
          srcDoc={state.content}
          title={`${selectedFile.title} 预览`}
        />
      ) : null}

      {state.status === "ready" && selectedFile && isMarkdownFile(selectedFile) ? (
        <div className="max-h-[34rem] overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <MarkdownContent content={state.content} />
          {state.truncated ? (
            <p className="mb-0 mt-3 text-xs text-slate-500">预览内容已截断，请打开完整文件查看。</p>
          ) : null}
        </div>
      ) : null}

      {!selectedFile && !isLoading && !isHydrating ? (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p className="m-0 font-semibold text-slate-800">还没有可预览产物</p>
          {progressSummary ? <p className="m-0">{progressSummary}</p> : null}
          {activeAgentName ? (
            <p className="m-0 text-xs text-slate-500">当前同事：{activeAgentName}</p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function selectPreviewFile(files: FileSurfaceEntry[]): FileSurfaceEntry | null {
  const sorted = [...files].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

  return (
    sorted.find(isHtmlFile) ??
    sorted.find(isMarkdownFile) ??
    sorted.find((file) => file.kind === "preview") ??
    null
  );
}

function parseArtifactContent(input: unknown): {
  content: string;
  mimeType: string;
  title: string;
  truncated: boolean;
} {
  if (typeof input !== "object" || input === null) {
    throw new Error("产物预览加载失败。");
  }

  const payload = input as Record<string, unknown>;

  return {
    content: typeof payload.content === "string" ? payload.content : "",
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "text/plain",
    title: typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title
      : "产物预览",
    truncated: payload.truncated === true
  };
}

function workflowStatusSummary(workflow: CodingWorkflowDetail | null): string | null {
  if (!workflow) {
    return null;
  }

  switch (workflow.state) {
    case "execution_running":
      return "软件工程师正在生成网页产物。";
    case "execution_failed":
      return "网页制作协作执行失败，请查看时间线里的失败说明后重新执行。";
    case "review_running":
      return "代码评审工程师正在检查产物。";
    case "qa_running":
      return "质量保障测试工程师正在验证产物。";
    case "summary_running":
      return "技术负责人正在汇总完成度。";
    case "plan_pending_approval":
      return "计划等待批准后才会开始执行。";
    default:
      return null;
  }
}

function hasRunningChannelWork(input: {
  agentRuns: MultiAgentRunLedger[];
  liveStatus: OrchestratorStatusEventPayload | null;
  workflow: CodingWorkflowDetail | null;
}): boolean {
  if (input.liveStatus?.state === "running") {
    return true;
  }

  if (input.agentRuns.some((run) => run.status === "running")) {
    return true;
  }

  return Boolean(input.workflow && [
    "execution_running",
    "review_running",
    "qa_running",
    "summary_running"
  ].includes(input.workflow.state));
}

function ThreadDrawer({
  artifactsByMessageId,
  artifactStatusesByMessageId,
  channelMembers,
  isSending,
  onClose,
  onSendReply,
  onTogglePinMessage,
  resolveAuthorLabel,
  thread
}: {
  artifactsByMessageId: Record<string, Artifact[]>;
  artifactStatusesByMessageId: ArtifactStatusesByMessageId;
  channelMembers: ChannelMember[];
  isSending: boolean;
  onClose: () => void;
  onSendReply: (input: {
    attachments: File[];
    content: string;
    mentionedAgentIds: string[];
    mentionedUserIds: string[];
  }) => Promise<boolean | void>;
  onTogglePinMessage: (message: Message) => Promise<void>;
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
            artifactStatusesByMessageId={artifactStatusesByMessageId}
            connectionState="idle"
            deployments={[]}
            isPinningMessageId={null}
            liveAssistantMessage={null}
            messages={threadMessages}
            onTogglePinMessage={onTogglePinMessage}
            resolveAuthorLabel={resolveAuthorLabel}
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
  isHydrating,
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
  isHydrating: boolean;
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
            {(isHydrating || isLoading) && !roster
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
      {isHydrating ? (
        <SurfaceLoading body="正在同步成员列表、权限和频道通知状态。" title="正在加载成员" />
      ) : (
        <>
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
        </>
      )}
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

function SurfaceLoading({ body, title }: { body: string; title: string }) {
  return (
    <article className="grid gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-600">
      <strong className="text-slate-950">{title}</strong>
      <p className="m-0">{body}</p>
      <div className="grid gap-2" aria-hidden="true">
        <span className="h-2 rounded-full bg-slate-200" />
        <span className="h-2 w-3/4 rounded-full bg-slate-200" />
        <span className="h-2 w-1/2 rounded-full bg-slate-200" />
      </div>
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

function formatAgentRunCheckpoint(checkpoint: MultiAgentRunLedger["checkpoint"]): string {
  switch (checkpoint) {
    case "created":
      return "已创建任务";
    case "context_prepared":
      return "已准备上下文";
    case "dispatch_started":
      return "已开始调用模型";
    case "result_received":
      return "已收到阶段结果";
    case "artifact_persisted":
      return "正在保存产物";
    case "finalized":
      return "正在收尾";
    case "failed":
      return "执行失败";
    default:
      return String(checkpoint).replace(/_/g, " ");
  }
}

function getVisibleMessageContent(message: Message): string {
  return message.role === "assistant"
    ? sanitizeAssistantVisibleContent(message.content)
    : message.content;
}

function shouldClearLiveStatus(messages: Message[]): boolean {
  const latestMessage = messages.at(-1);

  return Boolean(latestMessage && latestMessage.role !== "user");
}

const recoveryActionClassName =
  "rounded-full border border-red-100 bg-white px-3 py-1 text-red-700 transition hover:bg-red-50";
const recoveryLinkClassName =
  "rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 no-underline transition hover:bg-slate-50";

function buildChannelAvailabilityMessage(
  loadError: string | null,
  isMissing: boolean
): string | null {
  if (loadError) {
    const normalized = normalizeChannelErrorMessage(loadError);

    return isBlockingChannelError(normalized) ? normalized : null;
  }

  if (isMissing) {
    return "当前频道不存在或已不可用。";
  }

  return null;
}

function buildChannelRefreshErrorMessage(loadError: string | null): string | null {
  if (!loadError) {
    return null;
  }

  const normalized = normalizeChannelErrorMessage(loadError);

  return isBlockingChannelError(normalized) ? null : normalized;
}

function normalizeChannelErrorMessage(message: string): string {
  const trimmed = message.trim();

  if (!trimmed || trimmed === "请求失败。") {
    return "当前频道加载失败。";
  }

  if (trimmed === "发送消息失败。") {
    return "当前频道不存在或已不可用。";
  }

  if (/[{}[\]]/.test(trimmed) || /\b(workspaceId|conversationId|channelId)\b/.test(trimmed)) {
    return "当前频道加载失败。";
  }

  return trimmed;
}

function isBlockingChannelError(message: string): boolean {
  return /不存在|不可用|无权|没有权限|not found|forbidden|404|403/i.test(message);
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return readApiErrorMessage(payload, fallback);
}
