"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import {
  type CodingWorkflowDecision,
  type CodingWorkflowDetail,
  deployCommandResultSchema,
  type Artifact,
  type Conversation,
  type CustomAgent,
  type DeployCommandResult,
  type Message,
  type ModelConnection
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";
import {
  isBuiltInCodingTeammate
} from "../agents/built-in-coding-team";
import { AuthPanel } from "../auth/auth-panel";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";
import { NewConversationDialog } from "../conversations/new-conversation-dialog";
import {
  WorkModeLauncher,
  type CodingWorkflowDraft
} from "../workmodes/work-mode-launcher";
import {
  mergeRuntimeArtifactStatus,
  type ArtifactStatusesByMessageId
} from "./artifact-status";
import { ChatComposer } from "./chat-composer";
import { CodingWorkflowPanel } from "./coding-workflow-panel";
import { parseDeployCommand } from "./deploy-command";
import { ChatThread } from "./chat-thread";
import {
  createPendingAssistantMessage,
  shouldClearLiveAssistantMessage,
  type LiveAssistantMessage
} from "./live-assistant-message";
import { useConversationStream } from "./use-conversation-stream";

const timelineTabs = ["聊天", "文件", "置顶"] as const;
const postSendRefreshDelaysMs = [1_200, 4_000, 8_000, 15_000, 30_000, 65_000, 90_000] as const;

export function ChatExperience() {
  const {
    activeWorkspaceId: workspaceId,
    isLoading: isLoadingWorkspaces,
    refresh: refreshWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [modelConnections, setModelConnections] = useState<ModelConnection[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingDeleteConversationId, setConfirmingDeleteConversationId] =
    useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [hasLoadedCustomAgents, setHasLoadedCustomAgents] = useState(false);
  const [isLaunchingCodingWorkflow, setIsLaunchingCodingWorkflow] = useState(false);
  const [isLoadingCustomAgents, setIsLoadingCustomAgents] = useState(false);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [isPinningMessageId, setIsPinningMessageId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [liveAssistantMessage, setLiveAssistantMessage] =
    useState<LiveAssistantMessage | null>(null);
  const [deployments, setDeployments] = useState<DeployCommandResult[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifactsByMessageId, setArtifactsByMessageId] = useState<
    Record<string, Artifact[]>
  >({});
  const [artifactStatusesByMessageId, setArtifactStatusesByMessageId] =
    useState<ArtifactStatusesByMessageId>({});
  const [codingWorkflow, setCodingWorkflow] = useState<CodingWorkflowDetail | null>(null);
  const [isDecisioningWorkflow, setIsDecisioningWorkflow] =
    useState<CodingWorkflowDecision | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | null>(null);
  const postSendRefreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const processedStreamEventCountRef = useRef(0);
  const isWorkspaceReady = !isLoadingWorkspaces && Boolean(workspaceId);

  const stream = useConversationStream({
    conversationId: selectedConversationId,
    workspaceId
  });

  useEffect(() => {
    if (!isWorkspaceReady) {
      return;
    }

    void loadConversations();
    void loadModelConnections();
  }, [isWorkspaceReady, workspaceId]);

  useEffect(() => {
    setSelectedConversationId(null);
    setConfirmingDeleteConversationId(null);
    setDeletingConversationId(null);
    setMessages([]);
    setArtifactsByMessageId({});
    setArtifactStatusesByMessageId({});
    setLiveAssistantMessage(null);
    setDeployments([]);
    setComposerDraft(null);
    setCustomAgents([]);
    setCodingWorkflow(null);
    setHasLoadedCustomAgents(false);
    setIsDecisioningWorkflow(null);
    setIsLoadingWorkflow(false);
    setModelConnections([]);
    clearPostSendRefreshTimers();
    processedStreamEventCountRef.current = 0;
  }, [workspaceId]);

  useEffect(() => {
    if (!isWorkspaceReady || !selectedConversationId) {
      setMessages([]);
      setArtifactsByMessageId({});
      setArtifactStatusesByMessageId({});
      setCodingWorkflow(null);
      setLiveAssistantMessage(null);
      setDeployments([]);
      clearPostSendRefreshTimers();
      processedStreamEventCountRef.current = 0;
      return;
    }

    clearPostSendRefreshTimers();
    processedStreamEventCountRef.current = 0;
    setArtifactStatusesByMessageId({});
    setDeployments([]);
    void loadMessages(selectedConversationId);
    void loadCodingWorkflow(selectedConversationId);
  }, [isWorkspaceReady, selectedConversationId]);

  useEffect(() => () => clearPostSendRefreshTimers(), []);

  useEffect(() => {
    if (!selectedConversationId) {
      processedStreamEventCountRef.current = 0;
      return;
    }

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
          void loadMessages(selectedConversationId);
          return;
        }

        if (event.kind === "conversation.status") {
          if (event.payload.artifactStatus) {
            const { artifactStatus } = event.payload;
            setArtifactStatusesByMessageId((current) =>
              mergeRuntimeArtifactStatus(current, artifactStatus)
            );

            if (artifactStatus.status === "created") {
              void loadArtifactsForMessage(artifactStatus.messageId);
            }
          }

          if (event.payload.workflowId) {
            setCodingWorkflow((current) => {
              if (!current || current.id !== event.payload.workflowId) {
                return current;
              }

              return {
                ...current,
                approvalState: event.payload.approvalState ?? current.approvalState,
                state: event.payload.workflowState ?? current.state,
                taskSnapshot: event.payload.taskSnapshot ?? current.taskSnapshot
              };
            });
          }
        }
      });
    }
  }, [selectedConversationId, stream.events]);

  const conversationList = Array.isArray(conversations) ? conversations : [];
  const hasReadyModelConnection = modelConnections.some(
    (connection) => connection.status === "valid"
  );
  const codingEligibleCustomAgents = customAgents.filter(
    (agent) => !isBuiltInCodingTeammate(agent)
  );
  const selectedConversation =
    conversationList.find((conversation) => conversation.id === selectedConversationId) ?? null;
  useEffect(() => {
    if (
      !hasReadyModelConnection ||
      hasLoadedCustomAgents ||
      !isWorkspaceReady ||
      isLoadingCustomAgents
    ) {
      return;
    }

    void loadCustomAgents().catch(() => {});
  }, [
    hasLoadedCustomAgents,
    hasReadyModelConnection,
    isLoadingCustomAgents,
    isWorkspaceReady,
    workspaceId
  ]);

  async function loadConversations(): Promise<void> {
    try {
      const response = await fetch(`${apiBaseUrl}/conversations?workspaceId=${workspaceId}`, {
        credentials: "include"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        startTransition(() => {
          setConversations([]);
          setSelectedConversationId(null);
          setErrorMessage(readErrorMessage(payload, "无法加载会话。"));
        });
        return;
      }

      const nextConversations = asArray<Conversation>(payload);

      startTransition(() => {
        setErrorMessage(null);
        setConversations(nextConversations);
        setSelectedConversationId((current) =>
          current && nextConversations.some((conversation) => conversation.id === current)
            ? current
            : nextConversations[0]?.id ?? null
        );
      });
    } catch {
      startTransition(() => {
        setConversations([]);
        setSelectedConversationId(null);
        setErrorMessage("无法加载会话。");
      });
    }
  }

  async function loadMessages(conversationId: string): Promise<void> {
    try {
      const response = await fetch(
        `${apiBaseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`,
        {
          credentials: "include"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        startTransition(() => {
          setErrorMessage(readErrorMessage(payload, "无法加载消息。"));
        });
        return;
      }

      const nextMessages = asArray<Message>(payload);

      startTransition(() => {
        setErrorMessage(null);
        setMessages((current) => mergeMessages(current, nextMessages, conversationId));
        setLiveAssistantMessage((current) =>
          shouldClearLiveAssistantMessage(current, nextMessages) ? null : current
        );
      });

      await Promise.all(nextMessages.map((message) => loadArtifactsForMessage(message.id)));
    } catch {
      startTransition(() => {
        setErrorMessage("无法加载消息。");
      });
    }
  }

  async function loadCodingWorkflow(conversationId: string): Promise<void> {
    setIsLoadingWorkflow(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/coding-workflows?conversationId=${conversationId}&workspaceId=${workspaceId}`,
        {
          credentials: "include"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        startTransition(() => {
          setCodingWorkflow(null);
        });
        return;
      }

      startTransition(() => {
        setCodingWorkflow(
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as CodingWorkflowDetail)
            : null
        );
      });
    } catch {
      startTransition(() => {
        setCodingWorkflow(null);
      });
    } finally {
      setIsLoadingWorkflow(false);
    }
  }

  async function loadArtifactsForMessage(messageId: string): Promise<void> {
    try {
      const response = await fetch(
        `${apiBaseUrl}/artifacts?messageId=${messageId}&workspaceId=${workspaceId}`,
        {
          credentials: "include"
        }
      );

      if (!response?.ok) {
        return;
      }

      const payload = (await response.json()) as Artifact[];

      startTransition(() => {
        setArtifactsByMessageId((current) => ({
          ...current,
          [messageId]: payload
        }));
      });
    } catch {
      // Ignore artifact fetch failures so the chat timeline still renders.
    }
  }

  async function loadModelConnections(): Promise<void> {
    try {
      const response = await fetch(
        `${apiBaseUrl}/credentials/model-connections?workspaceId=${workspaceId}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        startTransition(() => {
          setModelConnections([]);
        });
        return;
      }

      const payload = await readJson(response);

      startTransition(() => {
        setModelConnections(asArray<ModelConnection>(payload));
      });
    } catch {
      startTransition(() => {
        setModelConnections([]);
      });
    }
  }

  async function loadCustomAgents(): Promise<CustomAgent[]> {
    setIsLoadingCustomAgents(true);

    try {
      const response = await fetch(`${apiBaseUrl}/custom-agents?workspaceId=${workspaceId}`, {
        credentials: "include"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "无法加载 AI 同事。"));
      }

      const nextAgents = asArray<CustomAgent>(payload);

      startTransition(() => {
        setCustomAgents(nextAgents);
        setHasLoadedCustomAgents(true);
      });

      return nextAgents;
    } catch (error) {
      startTransition(() => {
        setHasLoadedCustomAgents(true);
      });
      setErrorMessage(
        error instanceof Error ? error.message : "无法加载 AI 同事。"
      );
      throw error;
    } finally {
      setIsLoadingCustomAgents(false);
    }
  }

  async function createConversation(input: {
    agentIds: string[];
    mode: "direct" | "group";
    title?: string;
  }): Promise<Conversation> {
    const response = await fetch(`${apiBaseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds: input.agentIds,
        mode: input.mode,
        title: input.title,
        workspaceId
      }),
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(readErrorMessage(payload, "创建会话失败。"));
    }

    const payload = (await response.json()) as Conversation;

    startTransition(() => {
      setConversations((current) => [payload, ...current]);
      setSelectedConversationId(payload.id);
    });

    return payload;
  }

  async function handleCreateConversation(): Promise<void> {
    setErrorMessage(null);

    try {
      if (customAgents.length === 0) {
        await loadCustomAgents();
      }

      startTransition(() => {
        setIsNewConversationOpen(true);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "准备新会话失败。"
      );
    }
  }

  async function handleCreateCustomConversation(agentId: string): Promise<void> {
    setErrorMessage(null);
    setIsCreating(true);

    try {
      await createConversation({
        agentIds: [agentId],
        mode: "direct"
      });

      startTransition(() => {
        setIsNewConversationOpen(false);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "创建自定义会话失败。"
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteConversation(conversation: Conversation): Promise<void> {
    const conversationId = conversation.id;
    const isDeletingSelectedConversation = selectedConversationId === conversationId;

    setErrorMessage(null);
    setDeletingConversationId(conversationId);

    try {
      const response = await fetch(
        `${apiBaseUrl}/conversations/${encodeURIComponent(
          conversationId
        )}?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          credentials: "include",
          method: "DELETE"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "删除频道失败。"));
      }

      startTransition(() => {
        setConversations((current) =>
          current.filter((entry) => entry.id !== conversationId)
        );
        setSelectedConversationId((current) =>
          current === conversationId ? null : current
        );
        setMessages((current) =>
          current.filter((message) => message.conversationId !== conversationId)
        );
        setConfirmingDeleteConversationId(null);

        if (isDeletingSelectedConversation) {
          setArtifactsByMessageId({});
          setArtifactStatusesByMessageId({});
          setCodingWorkflow(null);
          setDeployments([]);
          setLiveAssistantMessage(null);
          clearPostSendRefreshTimers();
          processedStreamEventCountRef.current = 0;
        }
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "删除频道失败。"
      );
    } finally {
      setDeletingConversationId(null);
    }
  }

  async function sendUserMessage(input: {
    content: string;
    conversationId: string;
    mentionedAgentIds: string[];
    mentionedUserIds?: string[];
  }): Promise<Message> {
    const response = await fetch(`${apiBaseUrl}/messages/send`, {
      body: JSON.stringify({
        content: input.content,
        conversationId: input.conversationId,
        mentionedAgentIds: input.mentionedAgentIds,
        mentionedUserIds: input.mentionedUserIds ?? [],
        role: "user",
        workspaceId
      }),
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const payload = await readJson(response);

    if (!response.ok) {
      throw new Error(readErrorMessage(payload, "发送消息失败。"));
    }

    return payload as Message;
  }

  async function handleLaunchCodingWorkflow(draft: CodingWorkflowDraft): Promise<void> {
    setErrorMessage(null);
    setIsLaunchingCodingWorkflow(true);

    try {
      const response = await fetch(`${apiBaseUrl}/coding-workflows`, {
        body: JSON.stringify({
          deadline: draft.deadline || undefined,
          extraAgentIds: draft.extraAgentIds,
          goal: draft.goal,
          priority: draft.priority,
          recommendedRoleIds: draft.recommendedRoleIds,
          repoContext: draft.repoContext || undefined,
          workspaceId
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "启动编码工作流失败。"));
      }

      const created = payload as {
        conversation: Conversation;
        workflow: CodingWorkflowDetail;
      };

      startTransition(() => {
        setCodingWorkflow(created.workflow);
        setConversations((current) => [created.conversation, ...current]);
        setSelectedConversationId(created.conversation.id);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "启动编码工作流失败。"
      );
    } finally {
      setIsLaunchingCodingWorkflow(false);
    }
  }

  async function handleWorkflowDecision(input: {
    decision: CodingWorkflowDecision;
    note: string;
  }): Promise<void> {
    if (!codingWorkflow) {
      return;
    }

    setErrorMessage(null);
    setIsDecisioningWorkflow(input.decision);

    try {
      const response = await fetch(
        `${apiBaseUrl}/coding-workflows/${codingWorkflow.id}/decisions`,
        {
          body: JSON.stringify({
            decision: input.decision,
            note: input.note || undefined,
            workspaceId
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
        throw new Error(readErrorMessage(payload, "更新工作流决策失败。"));
      }

      startTransition(() => {
        setCodingWorkflow(payload as CodingWorkflowDetail);
      });
      await loadMessages(codingWorkflow.conversationId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "更新工作流决策失败。"
      );
    } finally {
      setIsDecisioningWorkflow(null);
    }
  }

  async function handleSend(input: {
    attachments: File[];
    content: string;
    mentionedAgentIds: string[];
    mentionedUserIds: string[];
  }): Promise<void> {
    if (!selectedConversationId) {
      return;
    }

    const conversationId = selectedConversationId;

    setErrorMessage(null);
    setIsSending(true);

    try {
      const deployCommand = parseDeployCommand(input.content);

      if (deployCommand) {
        const response = await fetch(`${apiBaseUrl}/deploys`, {
          body: JSON.stringify({
            conversationId: selectedConversationId,
            targetName: deployCommand.targetName,
            workspaceId
          }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const payload = await response.json();

        if (!response.ok) {
          const message = readErrorMessage(payload, "触发部署工作流失败。");
          throw new Error(message);
        }

        const parsedPayload = deployCommandResultSchema.parse(payload);

        startTransition(() => {
          setDeployments((current) => [
            parsedPayload,
            ...current.filter((entry) => entry.deployment.id !== parsedPayload.deployment.id)
          ]);
        });
        return;
      }

      const message = await sendUserMessage({
        content: input.content,
        conversationId,
        mentionedAgentIds: input.mentionedAgentIds,
        mentionedUserIds: input.mentionedUserIds
      });

      startTransition(() => {
        setMessages((current) => [...current, message]);
        setConversations((current) =>
          promoteConversationByActivity(current, conversationId, message.createdAt)
        );
        if ((selectedConversation?.participants.length ?? 0) > 0) {
          setLiveAssistantMessage(createPendingAssistantMessage(message.id));
        }
      });
      schedulePostSendRefresh(conversationId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "发送消息失败。"
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

  function schedulePostSendRefresh(conversationId: string): void {
    clearPostSendRefreshTimers();
    postSendRefreshTimersRef.current = postSendRefreshDelaysMs.map((delay) =>
      setTimeout(() => {
        void loadMessages(conversationId);
        void loadConversations();
      }, delay)
    );
  }

  function handleQuoteMessage(quoted: string): void {
    setComposerDraft(quoted);
  }

  function handleApplyDiffMessage(): void {
    setErrorMessage("已定位到 Diff 变更，请在产物卡片中展开并确认应用。");
  }

  async function handlePinMessage(messageId: string): Promise<void> {
    if (!selectedConversationId) {
      return;
    }

    const conversationId = selectedConversationId;

    setErrorMessage(null);
    setIsPinningMessageId(messageId);

    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${messageId}/pin?workspaceId=${workspaceId}`,
        {
          credentials: "include",
          method: "POST"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "置顶选中消息失败。"));
      }

      const parsed = payload as {
        message: Message;
        pinnedMessageIds: string[];
      };

      startTransition(() => {
        setMessages((current) =>
          current.map((message) =>
            message.id === parsed.message.id ? parsed.message : message
          )
        );
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  pinnedMessageIds: parsed.pinnedMessageIds
                }
              : conversation
          )
        );
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "置顶选中消息失败。"
      );
    } finally {
      setIsPinningMessageId(null);
    }
  }

  function handleAuthenticated(): void {
    startTransition(() => {
      setErrorMessage(null);
    });
    void refreshWorkspaces();
    void loadConversations();
    void loadModelConnections();
  }

  function handleLoggedOut(): void {
    startTransition(() => {
      setArtifactsByMessageId({});
      setCodingWorkflow(null);
      setConfirmingDeleteConversationId(null);
      setConversations([]);
      setCustomAgents([]);
      setDeletingConversationId(null);
      setHasLoadedCustomAgents(false);
      setDeployments([]);
      setComposerDraft(null);
      setErrorMessage(null);
      setIsDecisioningWorkflow(null);
      setLiveAssistantMessage(null);
      setMessages([]);
      setModelConnections([]);
      setSelectedConversationId(null);
    });
    void refreshWorkspaces();
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

    const teammate =
      codingWorkflow?.teammates.find((entry) => entry.agentId === message.sourceAgentId) ??
      selectedConversation?.participants.find(
        (entry) => entry.agentId === message.sourceAgentId
      );

    if (!teammate) {
      return "AI 同事";
    }

    return "name" in teammate ? teammate.name : teammate.agentName;
  }

  return (
    <AppShell
      workspaceSlot={
        <WorkspaceSwitcher
          activeWorkspaceId={workspaceId}
          isLoading={isLoadingWorkspaces}
          onSelect={selectWorkspace}
          workspaces={workspaces}
        />
      }
    >
      <section className="grid gap-6">
        <div className="mb-5 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 xl:flex-row xl:items-start">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">
              {selectedConversation ? `# ${selectedConversation.title}` : "频道时间线"}
            </h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              {selectedConversation
                ? "继续在这个频道里推进任务。消息、状态变化和产物都会沿着同一条时间线持续写回。"
                : hasReadyModelConnection
                  ? "先选择一个已有频道，或通过“启动编码工作流”拉起默认 AI 团队。"
                  : "先在设置中完成模型连接，再进入频道开始协作。"}
            </p>
          </div>
          <div className="grid gap-2 text-right">
            <div className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
              流：{formatStreamState(stream.connectionState)}
            </div>
          </div>
        </div>
        <section className="grid gap-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 shadow-sm">
          <div className="grid gap-2">
            <Badge tone="primary">协作入口</Badge>
            <h3 className="m-0 text-xl font-semibold text-slate-950">
              在同一个窗口里启动协作、选择频道并继续推进工作
            </h3>
            <p className="mb-0 text-sm leading-7 text-slate-600">
              登录状态、工作模式启动器、新建协作和频道列表都放在这里，避免把首页拆成额外的中间栏。
            </p>
          </div>
          <AuthPanel
            onAuthenticated={handleAuthenticated}
            onLoggedOut={handleLoggedOut}
          />
          <WorkModeLauncher
            canStartCoding={hasReadyModelConnection}
            customAgents={codingEligibleCustomAgents}
            isLaunching={isLaunchingCodingWorkflow}
            isLoadingCustomAgents={isLoadingCustomAgents}
            onLaunchCoding={handleLaunchCodingWorkflow}
          />
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="m-0 text-lg font-semibold text-slate-950">频道列表</h3>
                <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
                  选择一个已有频道，或新建一条协作继续推进任务、文件和审批。
                </p>
              </div>
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                {conversationList.length} 条
              </span>
            </div>
            {hasReadyModelConnection ? (
              <NewConversationDialog
                agents={customAgents}
                busy={isCreating}
                isLoading={isLoadingCustomAgents}
                isOpen={isNewConversationOpen}
                onCreate={handleCreateCustomConversation}
                onOpen={handleCreateConversation}
                onToggleOpen={setIsNewConversationOpen}
              />
            ) : (
              <a
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-900 no-underline transition hover:bg-white"
                href="/settings?section=model-connections"
              >
                添加模型连接
              </a>
            )}
            <div className="grid gap-2.5">
              {conversationList.map((conversation) => (
                <article
                  key={conversation.id}
                  className={`grid gap-3 rounded-3xl border bg-white/90 px-4 py-3 transition hover:bg-white ${
                    conversation.id === selectedConversationId
                      ? "border-sky-200 ring-2 ring-sky-100"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="grid min-w-0 flex-1 gap-1 text-left"
                      disabled={deletingConversationId === conversation.id}
                      onClick={() => {
                        setConfirmingDeleteConversationId(null);
                        setSelectedConversationId(conversation.id);
                      }}
                      type="button"
                    >
                      <strong className="truncate text-slate-950">
                        # {conversation.title}
                      </strong>
                      <span className="truncate text-xs text-slate-500">
                        {conversation.participants.map((entry) => entry.agentName).join(", ") ||
                          "暂无 AI 同事"}
                      </span>
                    </button>
                    <button
                      aria-label={`删除 ${conversation.title}`}
                      className="shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deletingConversationId === conversation.id}
                      onClick={() => {
                        setConfirmingDeleteConversationId(conversation.id);
                      }}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                  {confirmingDeleteConversationId === conversation.id ? (
                    <div className="grid gap-2 rounded-2xl border border-red-100 bg-red-50/80 p-3 text-xs text-red-800">
                      <p className="m-0 leading-5">
                        再次确认后会删除这个频道及其消息记录。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          aria-label={`确认删除 ${conversation.title}`}
                          className="rounded-full bg-red-700 px-3 py-1.5 font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={deletingConversationId === conversation.id}
                          onClick={() => {
                            void handleDeleteConversation(conversation);
                          }}
                          type="button"
                        >
                          {deletingConversationId === conversation.id ? "删除中..." : "确认删除"}
                        </button>
                        <button
                          aria-label={`取消删除 ${conversation.title}`}
                          className="rounded-full border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={deletingConversationId === conversation.id}
                          onClick={() => {
                            setConfirmingDeleteConversationId(null);
                          }}
                          type="button"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
              {conversationList.length === 0 ? (
                <p className="mb-0 text-sm leading-7 text-slate-600">
                  {hasReadyModelConnection
                    ? "当前还没有频道。先新建一条与 AI 同事的协作，再把任务、文件和置顶内容逐步沉淀进来。"
                    : "当前工作区还没有可用模型连接。先去设置完成连接，再开始新的频道协作。"}
                </p>
              ) : null}
            </div>
          </div>
        </section>
        <div className="mb-5 flex flex-wrap gap-2">
          {timelineTabs.map((tab, index) => (
            <button
              key={tab}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                index === 0
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white/80 text-slate-600"
              }`}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
        {errorMessage ? (
          <p className="mt-0 text-sm font-medium text-red-700">{errorMessage}</p>
        ) : null}
        {selectedConversationId && isLoadingWorkflow ? (
          <p className="mt-0 text-sm text-slate-500">正在加载当前频道的工作流状态...</p>
        ) : null}
        {codingWorkflow ? (
          <CodingWorkflowPanel
            busyDecision={isDecisioningWorkflow}
            messages={messages}
            onDecision={handleWorkflowDecision}
            workflow={codingWorkflow}
          />
        ) : null}
        <ChatThread
          artifactsByMessageId={artifactsByMessageId}
          artifactStatusesByMessageId={artifactStatusesByMessageId}
          connectionState={stream.connectionState}
          deployments={deployments}
          isPinningMessageId={isPinningMessageId}
          liveAssistantMessage={liveAssistantMessage}
          messages={messages}
          onApplyDiffMessage={handleApplyDiffMessage}
          onPinMessage={handlePinMessage}
          onQuoteMessage={handleQuoteMessage}
          resolveAuthorLabel={resolveMessageAuthorLabel}
        />
        <ChatComposer
          disabled={!selectedConversationId || isSending}
          draftContent={composerDraft}
          onDraftApplied={() => setComposerDraft(null)}
          onSend={handleSend}
          participants={selectedConversation?.participants ?? []}
        />
      </section>
    </AppShell>
  );
}

function formatStreamState(
  state: "connecting" | "error" | "idle" | "open"
): "空闲" | "连接中" | "连接失败" | "已连接" {
  switch (state) {
    case "connecting":
      return "连接中";
    case "error":
      return "连接失败";
    case "open":
      return "已连接";
    case "idle":
      return "空闲";
  }
}

function asArray<T>(payload: unknown): T[] {
  return Array.isArray(payload) ? (payload as T[]) : [];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return readApiErrorMessage(payload, fallback);
}

function promoteConversationByActivity(
  conversations: Conversation[],
  conversationId: string,
  updatedAt: Conversation["updatedAt"]
): Conversation[] {
  const nextConversations = conversations.filter(
    (conversation) => conversation.id !== conversationId
  );
  const conversation = conversations.find((entry) => entry.id === conversationId);

  if (!conversation) {
    return conversations;
  }

  return [
    {
      ...conversation,
      updatedAt
    },
    ...nextConversations
  ];
}

function mergeMessages(
  currentMessages: Message[],
  nextMessages: Message[],
  conversationId: string
): Message[] {
  const merged = new Map(
    currentMessages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => [message.id, message])
  );

  for (const message of nextMessages) {
    merged.set(message.id, message);
  }

  return [...merged.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}
