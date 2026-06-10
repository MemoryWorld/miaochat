"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type CodingWorkflowDecision,
  type CodingWorkflowDetail,
  type CodingWorkflowLaunchResponse,
  deployCommandResultSchema,
  type Artifact,
  type Conversation,
  type CustomAgent,
  type DeployCommandResult,
  isMessageAttachmentTextMimeType,
  type Message,
  messageAttachmentInputMaxContentChars,
  messageAttachmentInputMaxCount,
  messageAttachmentInputMaxFileNameChars,
  type MessageAttachmentInput,
  type ModelConnection,
  type OrchestratorStatusEventPayload,
  type ProviderCredential,
  type VisualWorkflow
} from "@agenthub/contracts";

import { Button } from "../../components/ui/button";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";
import { ArtifactCard } from "../artifacts/artifact-card";
import { buildArtifactContentUrl } from "../artifacts/artifact-links";
import { digestSha256 } from "../artifacts/digest";
import {
  isBuiltInCodingTeammate
} from "../agents/built-in-coding-team";
import { AuthPanel } from "../auth/auth-panel";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";
import {
  NewConversationDialog,
  type NewConversationAgentOption
} from "../conversations/new-conversation-dialog";
import {
  WorkModeLauncher,
  type CodingWorkflowDraft
} from "../workmodes/work-mode-launcher";
import { VisualWorkflowPanel } from "../workflows/visual-workflow-panel";
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

const postSendRefreshDelaysMs = [1_200, 4_000, 8_000, 15_000, 30_000, 65_000, 90_000] as const;
const realtimeStreamConnectingMessage = "正在连接实时流，稍后即可发送。";
const archivedConversationRetentionNotice =
  "归档会话将在 30 天后自动删除，请及时恢复需要保留的会话。";

type TimelineFileEntry = {
  artifact: Artifact;
  message: Message;
};

type CredentialMetadata = Omit<ProviderCredential, "encryptedSecret">;

type SupportedConversationProvider = "claude-code" | "codex" | "opencode";

type ConversationAgentOption = NewConversationAgentOption & {
  agentId?: string;
  provider: SupportedConversationProvider;
};

type MessageDispatchResponse = Message & {
  launchedCodingWorkflow?: CodingWorkflowLaunchResponse;
  launchedWorkflow?: VisualWorkflow;
};

const platformRuntimeAgentTag = "platform-runtime-agent";
const hiddenConversationAgentNames = new Set([
  "方案规划同事",
  "执行落地同事",
  "需求梳理同事"
]);
const hiddenConversationAgentTags = new Set([
  "builtin-coding-team",
  "demo",
  "phase-a"
]);
const platformProviderProfiles: Array<{
  description: string;
  label: string;
  provider: SupportedConversationProvider;
  systemPrompt: string;
}> = [
  {
    description: "使用 OpenAI Codex 处理代码、网页和工程任务。",
    label: "Codex",
    provider: "codex",
    systemPrompt: "你是 Miaochat 中的 Codex 平台 Agent，擅长代码、网页和工程任务。"
  },
  {
    description: "使用 Claude Code 处理代码理解、编辑和交付任务。",
    label: "Claude Code",
    provider: "claude-code",
    systemPrompt: "你是 Miaochat 中的 Claude Code 平台 Agent，擅长代码理解、编辑和交付任务。"
  },
  {
    description: "使用 OpenCode 接入的模型处理通用实现任务。",
    label: "OpenCode",
    provider: "opencode",
    systemPrompt: "你是 Miaochat 中的 OpenCode 平台 Agent，擅长通用实现和内容生成任务。"
  }
];

export function ChatExperience() {
  const router = useRouter();
  const {
    activeWorkspaceId: workspaceId,
    error: workspaceError,
    isLoading: isLoadingWorkspaces,
    requiresLogin,
    refresh: refreshWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [modelConnections, setModelConnections] = useState<ModelConnection[]>([]);
  const [providerCredentials, setProviderCredentials] = useState<CredentialMetadata[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingDeleteConversationId, setConfirmingDeleteConversationId] =
    useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [includeArchivedConversations, setIncludeArchivedConversations] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasLoadedCustomAgents, setHasLoadedCustomAgents] = useState(false);
  const [isLaunchingCodingWorkflow, setIsLaunchingCodingWorkflow] = useState(false);
  const [isLoadingCustomAgents, setIsLoadingCustomAgents] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [isPinningMessageId, setIsPinningMessageId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [liveAssistantMessage, setLiveAssistantMessage] =
    useState<LiveAssistantMessage | null>(null);
  const [liveOrchestratorStatus, setLiveOrchestratorStatus] =
    useState<OrchestratorStatusEventPayload | null>(null);
  const [deployments, setDeployments] = useState<DeployCommandResult[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifactsByMessageId, setArtifactsByMessageId] = useState<
    Record<string, Artifact[]>
  >({});
  const [artifactStatusesByMessageId, setArtifactStatusesByMessageId] =
    useState<ArtifactStatusesByMessageId>({});
  const [codingWorkflow, setCodingWorkflow] = useState<CodingWorkflowDetail | null>(null);
  const [visualWorkflows, setVisualWorkflows] = useState<VisualWorkflow[]>([]);
  const [executingVisualWorkflowId, setExecutingVisualWorkflowId] = useState<string | null>(null);
  const [isDecisioningWorkflow, setIsDecisioningWorkflow] =
    useState<CodingWorkflowDecision | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<string | null>(null);
  const [isCodingLauncherOpen, setIsCodingLauncherOpen] = useState(false);
  const [requestedConversationId, setRequestedConversationId] = useState<
    string | null | undefined
  >(undefined);
  const postSendRefreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const processedStreamEventCountRef = useRef(0);
  const customAgentsLoadPromiseRef = useRef<Promise<CustomAgent[]> | null>(null);
  const providerCredentialsLoadPromiseRef = useRef<Promise<CredentialMetadata[]> | null>(null);
  const isWorkspaceReady = !isLoadingWorkspaces && Boolean(workspaceId) && !requiresLogin;
  const isInitialWorkspaceLoading =
    isLoadingWorkspaces && workspaces.length === 0 && !requiresLogin;
  const shouldShowWorkspaceRecoveryOnly = requiresLogin || isInitialWorkspaceLoading;

  const stream = useConversationStream({
    conversationId: selectedConversationId,
    workspaceId
  });
  const isComposerWaitingForStream = Boolean(
    selectedConversationId && stream.connectionState === "connecting"
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      setRequestedConversationId(null);
      return;
    }

    setRequestedConversationId(
      new URLSearchParams(window.location.search).get("conversationId")
    );
  }, []);

  useEffect(() => {
    if (!isWorkspaceReady || requestedConversationId === undefined) {
      return;
    }

    void loadConversations();
    void loadModelConnections();
    void loadProviderCredentials();
  }, [includeArchivedConversations, isWorkspaceReady, requestedConversationId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !selectedConversationId) {
      return;
    }

    window.localStorage.setItem(
      buildLastConversationStorageKey(workspaceId),
      selectedConversationId
    );
  }, [selectedConversationId, workspaceId]);

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
    setVisualWorkflows([]);
    setExecutingVisualWorkflowId(null);
    setHasLoadedCustomAgents(false);
    setIsDecisioningWorkflow(null);
    setIsLoadingConversations(false);
    setIsLoadingMessages(false);
    setIsLoadingWorkflow(false);
    setModelConnections([]);
    setProviderCredentials([]);
    customAgentsLoadPromiseRef.current = null;
    providerCredentialsLoadPromiseRef.current = null;
    clearPostSendRefreshTimers();
    processedStreamEventCountRef.current = 0;
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setIsLoadingMessages(false);
      setArtifactsByMessageId({});
      setArtifactStatusesByMessageId({});
      setCodingWorkflow(null);
      setVisualWorkflows([]);
      setExecutingVisualWorkflowId(null);
      setLiveAssistantMessage(null);
      setDeployments([]);
      clearPostSendRefreshTimers();
      processedStreamEventCountRef.current = 0;
      return;
    }

    if (!isWorkspaceReady) {
      return;
    }

    clearPostSendRefreshTimers();
    processedStreamEventCountRef.current = 0;
    setArtifactStatusesByMessageId({});
    setDeployments([]);
    void loadMessages(selectedConversationId);
    void loadCodingWorkflow(selectedConversationId);
    void loadVisualWorkflows(selectedConversationId);
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
          setLiveOrchestratorStatus(null);
          setLiveAssistantMessage({
            content: "",
            id: event.payload.messageId,
            isComplete: false
          });
          return;
        }

        if (event.kind === "conversation.message.delta") {
          setLiveAssistantMessage((current) => ({
            content:
              current?.id === event.payload.messageId
                ? `${current.content}${event.payload.delta}`
                : event.payload.delta,
            id: event.payload.messageId,
            isComplete: false
          }));
          return;
        }

        if (event.kind === "conversation.message.completed") {
          setLiveOrchestratorStatus(null);
          setLiveAssistantMessage({
            content: event.payload.finalContent,
            id: event.payload.messageId,
            isComplete: true
          });
          void loadMessages(selectedConversationId);
          schedulePostSendRefresh(selectedConversationId);
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
              void loadArtifactsForMessage(artifactStatus.messageId);
            }
          } else {
            schedulePostSendRefresh(selectedConversationId);
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
  const validConversationProviders = resolveValidConversationProviders(
    providerCredentials,
    modelConnections
  );
  const hasReadyModelConnection = validConversationProviders.size > 0;
  const conversationAgentOptions = buildConversationAgentOptions(
    customAgents,
    validConversationProviders
  );
  const codingEligibleCustomAgents = customAgents.filter(
    (agent) => !isBuiltInCodingTeammate(agent)
  );
  const selectedConversation =
    conversationList.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const visibleConversations = sortConversationsForInbox(
    conversationList.filter((conversation) => {
      const matchesArchiveView = includeArchivedConversations
        ? Boolean(conversation.archivedAt)
        : !conversation.archivedAt;

      return matchesArchiveView && matchesConversationSearch(conversation, conversationSearch);
    })
  );
  const timelineFileEntries = messages.flatMap((message) =>
    (artifactsByMessageId[message.id] ?? []).map((artifact) => ({
      artifact,
      message
    }))
  );
  const pinnedTimelineMessages = messages.filter((message) => message.isPinned);
  const selectedHtmlArtifact = timelineFileEntries.find(({ artifact }) =>
    isHtmlArtifact(artifact)
  )?.artifact ?? null;

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
    setIsLoadingConversations(true);

    try {
      const params = new URLSearchParams({ workspaceId: workspaceId ?? "" });
      if (includeArchivedConversations) {
        params.set("includeArchived", "true");
      }
      const response = await fetch(`${apiBaseUrl}/conversations?${params.toString()}`, {
        credentials: "include"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        startTransition(() => {
          setErrorMessage(readErrorMessage(payload, "无法加载会话。"));
        });
        return;
      }

      const nextConversations = asArray<Conversation>(payload);

      startTransition(() => {
        setErrorMessage(null);
        setConversations(nextConversations);
        setSelectedConversationId((current) => {
          if (current && nextConversations.some((conversation) => conversation.id === current)) {
            return current;
          }

          if (
            requestedConversationId &&
            nextConversations.some((conversation) => conversation.id === requestedConversationId)
          ) {
            return requestedConversationId;
          }

          const restoredConversationId = resolveStoredConversationId(
            workspaceId,
            nextConversations
          );

          return restoredConversationId ?? nextConversations[0]?.id ?? null;
        });
      });
    } catch {
      startTransition(() => {
        setErrorMessage("无法加载会话。");
      });
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId: string): Promise<void> {
    setIsLoadingMessages(true);

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
        setLiveOrchestratorStatus((current) =>
          current && shouldClearLiveStatus(nextMessages) ? null : current
        );
      });

      await Promise.all(nextMessages.map((message) => loadArtifactsForMessage(message.id)));
    } catch {
      startTransition(() => {
        setErrorMessage("无法加载消息。");
      });
    } finally {
      setIsLoadingMessages(false);
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

  async function loadVisualWorkflows(conversationId: string): Promise<void> {
    try {
      const response = await fetch(
        `${apiBaseUrl}/visual-workflows?channelId=${conversationId}&workspaceId=${workspaceId}`,
        {
          credentials: "include"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        return;
      }

      startTransition(() => {
        setVisualWorkflows((current) =>
          mergeVisualWorkflows(asArray<VisualWorkflow>(payload), current)
        );
      });
    } catch {
      // Keep the chat usable when workflow status is temporarily unavailable.
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

  async function loadProviderCredentials(): Promise<CredentialMetadata[]> {
    if (providerCredentialsLoadPromiseRef.current) {
      return providerCredentialsLoadPromiseRef.current;
    }

    const loadPromise = (async () => {
      const response = await fetch(`${apiBaseUrl}/credentials?workspaceId=${workspaceId}`, {
        credentials: "include"
      });

      if (!response.ok) {
        setProviderCredentials([]);
        return [];
      }

      const payload = await readJson(response);
      const nextCredentials = asArray<CredentialMetadata>(payload);

      setProviderCredentials(nextCredentials);

      return nextCredentials;
    })();

    providerCredentialsLoadPromiseRef.current = loadPromise;

    try {
      return await loadPromise;
    } catch {
      setProviderCredentials([]);
      return [];
    } finally {
      providerCredentialsLoadPromiseRef.current = null;
    }
  }

  async function loadCustomAgents(): Promise<CustomAgent[]> {
    if (customAgentsLoadPromiseRef.current) {
      return customAgentsLoadPromiseRef.current;
    }

    setIsLoadingCustomAgents(true);

    const loadPromise = (async () => {
      const response = await fetch(`${apiBaseUrl}/custom-agents?workspaceId=${workspaceId}`, {
        credentials: "include"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "无法加载 AI 同事。"));
      }

      const nextAgents = asArray<CustomAgent>(payload);

      setCustomAgents(nextAgents);
      setHasLoadedCustomAgents(true);

      return nextAgents;
    })();

    customAgentsLoadPromiseRef.current = loadPromise;

    try {
      return await loadPromise;
    } catch (error) {
      setHasLoadedCustomAgents(true);
      setErrorMessage(
        error instanceof Error ? error.message : "无法加载 AI 同事。"
      );
      throw error;
    } finally {
      customAgentsLoadPromiseRef.current = null;
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

  async function resolveConversationAgentIds(optionIds: string[]): Promise<string[]> {
    const resolvedAgentIds: string[] = [];

    for (const optionId of optionIds) {
      const option = conversationAgentOptions.find((entry) => entry.id === optionId) ?? null;

      if (!option) {
        throw new Error("请选择可用的 Agent。");
      }

      if (option.agentId) {
        resolvedAgentIds.push(option.agentId);
        continue;
      }

      resolvedAgentIds.push(await ensurePlatformAgent(option.provider));
    }

    return [...new Set(resolvedAgentIds)];
  }

  async function ensurePlatformAgent(
    provider: SupportedConversationProvider
  ): Promise<string> {
    const existingAgent = findDefaultPlatformAgent(customAgents, provider);

    if (existingAgent) {
      return existingAgent.id;
    }

    const profile = getPlatformProviderProfile(provider);
    let createdAgent: CustomAgent;

    try {
      createdAgent = await createPlatformAgent(profile.label, profile);
    } catch (error) {
      if (!isConflictError(error)) {
        throw error;
      }

      createdAgent = await createPlatformAgent(`${profile.label} Agent`, profile);
    }

    startTransition(() => {
      setCustomAgents((current) => [createdAgent, ...current]);
      setHasLoadedCustomAgents(true);
    });

    return createdAgent.id;
  }

  async function createPlatformAgent(
    name: string,
    profile: (typeof platformProviderProfiles)[number]
  ): Promise<CustomAgent> {
    const credential = findCredentialForProvider(providerCredentials, profile.provider);

    if (!credential) {
      throw new Error("请先在设置中添加并验证模型连接。");
    }

    const response = await fetch(`${apiBaseUrl}/custom-agents`, {
      body: JSON.stringify({
        approvalMode: "balanced",
        avatarUrl: null,
        capabilityTags: [platformRuntimeAgentTag],
        memoryMode: "workspace_plus_teammate",
        modelProfileId: credential.id,
        name,
        outputStyle: "清晰、结构化、先给结论再给步骤。",
        provider: profile.provider,
        scopeDescription: `通过 ${profile.label} 处理当前对话中的任务。`,
        systemPrompt: profile.systemPrompt,
        toolBindings: [],
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
      throw createHttpError(response.status, readErrorMessage(payload, "创建平台 Agent 失败。"));
    }

    return payload as CustomAgent;
  }

  async function handleCreateConversation(): Promise<void> {
    setErrorMessage(null);

    try {
      await Promise.all([
        hasLoadedCustomAgents ? Promise.resolve(customAgents) : loadCustomAgents(),
        providerCredentials.length === 0
          ? loadProviderCredentials()
          : Promise.resolve(providerCredentials)
      ]);

      startTransition(() => {
        setIsNewConversationOpen(true);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "准备新会话失败。"
      );
    }
  }

  async function handleCreateCustomConversation(input: {
    agentOptionIds: string[];
    mode: "direct" | "group";
    title?: string;
  }): Promise<void> {
    setErrorMessage(null);
    setIsCreating(true);

    try {
      const agentIds = await resolveConversationAgentIds(input.agentOptionIds);
      await createConversation({
        agentIds,
        mode: input.mode,
        title: input.title
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
        throw new Error(readErrorMessage(payload, "删除会话失败。"));
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
          setVisualWorkflows([]);
          setExecutingVisualWorkflowId(null);
          setDeployments([]);
          setLiveAssistantMessage(null);
          setLiveOrchestratorStatus(null);
          clearPostSendRefreshTimers();
          processedStreamEventCountRef.current = 0;
        }
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "删除会话失败。"
      );
    } finally {
      setDeletingConversationId(null);
    }
  }

  async function handleConversationListAction(
    conversation: Conversation,
    path: "archive" | "pin" | "restore" | "unpin"
  ): Promise<void> {
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/conversations/${encodeURIComponent(
          conversation.id
        )}/${path}?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          credentials: "include",
          method: "POST"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "更新会话失败。"));
      }

      const nextConversation = payload as Conversation;

      startTransition(() => {
        setConversations((current) =>
          sortConversationsForInbox(
            current.map((entry) =>
              entry.id === nextConversation.id ? nextConversation : entry
            )
          )
        );
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "更新会话失败。");
    }
  }

  async function sendUserMessage(input: {
    attachments?: MessageAttachmentInput[];
    content: string;
    conversationId: string;
    mentionedAgentIds: string[];
    mentionedUserIds?: string[];
  }): Promise<MessageDispatchResponse> {
    const response = await fetch(`${apiBaseUrl}/messages/send`, {
      body: JSON.stringify({
        attachments: input.attachments ?? [],
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

    return payload as MessageDispatchResponse;
  }

  function applyCodingWorkflowLaunch(created: CodingWorkflowLaunchResponse): void {
    setCodingWorkflow(created.workflow);
    setConversations((current) => [
      created.conversation,
      ...current.filter((conversation) => conversation.id !== created.conversation.id)
    ]);
    setSelectedConversationId(created.conversation.id);
    setMessages([]);
    setArtifactsByMessageId({});
    setArtifactStatusesByMessageId({});
    setDeployments([]);
    setLiveAssistantMessage(null);
    setLiveOrchestratorStatus(null);
    processedStreamEventCountRef.current = 0;
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
        throw new Error(readErrorMessage(payload, "启动网页制作协作失败。"));
      }

      const created = payload as {
        conversation: Conversation;
        workflow: CodingWorkflowDetail;
      };

      startTransition(() => {
        applyCodingWorkflowLaunch(created);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "启动网页制作协作失败。"
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
        throw new Error(readErrorMessage(payload, "更新计划审批失败。"));
      }

      startTransition(() => {
        setCodingWorkflow(payload as CodingWorkflowDetail);
      });
      await loadMessages(codingWorkflow.conversationId);
      schedulePostSendRefresh(codingWorkflow.conversationId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "更新计划审批失败。"
      );
    } finally {
      setIsDecisioningWorkflow(null);
    }
  }

  async function handleExecuteVisualWorkflow(targetWorkflow: VisualWorkflow): Promise<void> {
    if (!workspaceId) {
      setErrorMessage("请先选择工作区后再执行 workflow。");
      return;
    }

    setErrorMessage(null);
    setExecutingVisualWorkflowId(targetWorkflow.id);
    setVisualWorkflows((current) =>
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
        throw new Error(readErrorMessage(payload, "执行 workflow 失败。"));
      }

      const executedWorkflow = payload as VisualWorkflow;
      startTransition(() => {
        setVisualWorkflows((current) =>
          mergeVisualWorkflows([executedWorkflow], current)
        );
      });
      await Promise.all([
        loadVisualWorkflows(targetWorkflow.conversationId),
        loadArtifactsForMessage(targetWorkflow.sourceMessageId),
        loadMessages(targetWorkflow.conversationId)
      ]);
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
    if (!workspaceId) {
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
        throw new Error(readErrorMessage(payload, fallbackError));
      }

      const nextWorkflow = payload as VisualWorkflow;
      startTransition(() => {
        setVisualWorkflows((current) =>
          mergeVisualWorkflows([nextWorkflow], current)
        );
      });
      await loadVisualWorkflows(targetWorkflow.conversationId);
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
  }): Promise<boolean | void> {
    if (!selectedConversationId) {
      return false;
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
        attachments: await readTextAttachments(input.attachments),
        content: input.content,
        conversationId,
        mentionedAgentIds: input.mentionedAgentIds,
        mentionedUserIds: input.mentionedUserIds
      });
      void loadArtifactsForMessage(message.id);

      const launchedWorkflow = message.launchedWorkflow;

      if (launchedWorkflow) {
        startTransition(() => {
          setMessages((current) => [...current, message]);
          setVisualWorkflows((current) =>
            mergeVisualWorkflows([launchedWorkflow], current)
          );
          setConversations((current) =>
            promoteConversationByActivity(current, conversationId, message.createdAt)
          );
          setLiveAssistantMessage(null);
          setLiveOrchestratorStatus(null);
        });
        void loadVisualWorkflows(conversationId);
        router.push(
          `/workflows/${launchedWorkflow.id}?workspaceId=${encodeURIComponent(workspaceId)}`
        );
        return;
      }

      const launchedCodingWorkflow = message.launchedCodingWorkflow;

      if (launchedCodingWorkflow) {
        startTransition(() => {
          applyCodingWorkflowLaunch(launchedCodingWorkflow);
        });
        return;
      }

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
      return false;
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
        void loadCodingWorkflow(conversationId);
        void loadVisualWorkflows(conversationId);
        void loadConversations();
      }, delay)
    );
  }

  function handleQuoteMessage(quoted: string): void {
    setComposerDraft(quoted);
  }

  async function handleApplyDiffMessage(message: Message): Promise<string> {
    const diffArtifact = (artifactsByMessageId[message.id] ?? []).find(
      (artifact) => artifact.kind === "diff"
    );

    if (!diffArtifact) {
      const status = "该消息没有可应用的 Diff 产物。";
      setErrorMessage(status);
      return status;
    }

    if (!diffArtifact.previewUrl && !diffArtifact.storageKey) {
      const status = "该 Diff 产物没有可读取的内容，暂时无法应用。";
      setErrorMessage(status);
      return status;
    }

    const patch = await readDiffArtifactContent(diffArtifact);
    const contentDigest = await digestSha256(patch);
    const revisionResponse = await fetch(
      `${apiBaseUrl}/artifacts/${encodeURIComponent(diffArtifact.id)}/revisions?workspaceId=${encodeURIComponent(diffArtifact.workspaceId)}`,
      {
        body: JSON.stringify({
          contentDigest,
          previewUrl: diffArtifact.previewUrl,
          storageKey: diffArtifact.storageKey,
          summary: `Applied diff from message ${message.id}`
        }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }
    );
    const payload = await readJson(revisionResponse);

    if (!revisionResponse.ok) {
      throw new Error(readErrorMessage(payload, "应用 Diff 失败。"));
    }

    setErrorMessage(null);

    const revision = payload as { revisionIndex?: number } | null;
    return typeof revision?.revisionIndex === "number"
      ? `Diff 已应用并记录为版本 #${revision.revisionIndex}。`
      : "Diff 已应用并记录为产物版本。";
  }

  async function readDiffArtifactContent(diffArtifact: Artifact): Promise<string> {
    if (diffArtifact.storageKey) {
      const diffResponse = await fetch(
        buildArtifactContentUrl(diffArtifact.id, diffArtifact.workspaceId),
        { credentials: "include" }
      );

      if (!diffResponse.ok) {
        throw new Error(`读取 Diff 内容失败（${diffResponse.status}）。`);
      }

      const payload = await readJson(diffResponse) as { content?: unknown };
      return typeof payload?.content === "string" ? payload.content : "";
    }

    if (!diffArtifact.previewUrl) {
      return "";
    }

    const diffResponse = await fetch(diffArtifact.previewUrl);

    if (!diffResponse.ok) {
      throw new Error(`读取 Diff 内容失败（${diffResponse.status}）。`);
    }

    return diffResponse.text();
  }

  async function handleTogglePinMessage(message: Message): Promise<void> {
    if (!selectedConversationId) {
      return;
    }

    const conversationId = selectedConversationId;
    const nextAction = message.isPinned ? "unpin" : "pin";
    const fallbackMessage = message.isPinned
      ? "取消置顶消息失败。"
      : "置顶选中消息失败。";

    setErrorMessage(null);
    setIsPinningMessageId(message.id);

    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${message.id}/${nextAction}?workspaceId=${workspaceId}`,
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
        error instanceof Error ? error.message : fallbackMessage
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

  const conversationCountLabel =
    isLoadingConversations && conversationList.length === 0
      ? "同步中"
      : `${visibleConversations.length} 条`;
  const selectedParticipantLabel =
    selectedConversation?.participants.map((entry) => entry.agentName).join(", ") ||
    "还没有绑定 Agent";
  const shouldShowStreamStatus =
    Boolean(selectedConversationId) &&
    (stream.connectionState === "connecting" || stream.connectionState === "error");

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_48%,_#f8fafc_100%)] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 px-4 py-3 shadow-[0_1px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white no-underline"
              href="/"
            >
              Miaochat
            </Link>
            <nav aria-label="编码工作台导航" className="flex items-center gap-2 text-sm">
              <Link className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-900 no-underline" href="/">
                会话
              </Link>
              <Link className="rounded-full px-3 py-1.5 font-semibold text-slate-600 no-underline transition hover:bg-white hover:text-slate-950" href="/workflows">
                Workflow
              </Link>
              <Link className="rounded-full px-3 py-1.5 font-semibold text-slate-600 no-underline transition hover:bg-white hover:text-slate-950" href="/settings?section=model-connections">
                模型连接
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <WorkspaceSwitcher
              activeWorkspaceId={workspaceId}
              isLoading={isLoadingWorkspaces}
              onSelect={selectWorkspace}
              workspaces={workspaces}
            />
            <Link className="text-sm font-semibold text-slate-600 no-underline transition hover:text-slate-950" href="/settings">
              设置
            </Link>
          </div>
        </div>
      </header>

      <main className={`mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1800px] gap-3 p-3 ${
        shouldShowWorkspaceRecoveryOnly
          ? "xl:grid-cols-[330px_minmax(0,1fr)]"
          : "xl:grid-cols-[330px_minmax(0,1fr)_400px]"
      }`}>
        <aside className="grid min-h-[72vh] content-start gap-4 rounded-[24px] border border-white/80 bg-white/82 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:sticky xl:top-20 xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto">
          {requiresLogin ? (
            <article
              className="grid gap-3 rounded-[12px] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700"
              role="alert"
            >
              <div>
                <h1 className="m-0 text-lg font-semibold text-slate-950">会话</h1>
                <p className="m-0 mt-1 text-sm leading-6 text-slate-600">
                  {workspaceError ?? "请先登录后再继续操作。"}
                </p>
              </div>
              <Link
                className="inline-flex w-fit rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white no-underline transition hover:bg-slate-800"
                href="/settings?section=profile"
              >
                前往设置登录
              </Link>
            </article>
          ) : isInitialWorkspaceLoading ? (
            <>
              <div>
                <h1 className="m-0 text-lg font-semibold text-slate-950">会话</h1>
                <p className="m-0 mt-1 text-xs font-medium text-slate-500">正在恢复工作区</p>
              </div>
              <ConversationListSkeleton />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="m-0 text-lg font-semibold text-slate-950">会话</h1>
                  <p className="m-0 mt-1 text-xs font-medium text-slate-500">{conversationCountLabel}</p>
                </div>
                {!hasReadyModelConnection ? (
                  <Link
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 no-underline transition hover:bg-slate-50"
                    href="/settings?section=model-connections"
                  >
                    添加模型
                  </Link>
                ) : null}
              </div>

              <NewConversationDialog
                agentOptions={conversationAgentOptions}
                busy={isCreating}
                isLoading={isLoadingCustomAgents}
                isOpen={isNewConversationOpen}
                onCreate={handleCreateCustomConversation}
                onOpen={handleCreateConversation}
                onToggleOpen={setIsNewConversationOpen}
              />

              <label className="grid gap-2 text-sm font-semibold text-slate-700" htmlFor="conversation-search">
                搜索
                <input
                  className="h-10 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-normal outline-none transition focus:border-slate-400 focus:bg-white"
                  id="conversation-search"
                  onChange={(event) => setConversationSearch(event.target.value)}
                  placeholder="搜索会话、Agent 或产物线索"
                  type="search"
                  value={conversationSearch}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  aria-label="查看最近会话"
                  aria-pressed={!includeArchivedConversations}
                  onClick={() => setIncludeArchivedConversations(false)}
                  size="sm"
                  variant={!includeArchivedConversations ? "default" : "outline"}
                >
                  最近
                </Button>
                <Button
                  aria-label="查看归档会话"
                  aria-pressed={includeArchivedConversations}
                  onClick={() => setIncludeArchivedConversations(true)}
                  size="sm"
                  variant={includeArchivedConversations ? "default" : "outline"}
                >
                  归档
                </Button>
              </div>
              {includeArchivedConversations ? (
                <p className="m-0 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                  {archivedConversationRetentionNotice}
                </p>
              ) : null}

              <div className="grid gap-2" data-testid="conversation-list">
                {isLoadingConversations && conversationList.length === 0 ? (
                  <ConversationListSkeleton />
                ) : visibleConversations.length > 0 ? (
                  visibleConversations.map((conversation) => (
                    <ConversationListItem
                      conversation={conversation}
                      isDeleting={deletingConversationId === conversation.id}
                      isSelected={conversation.id === selectedConversationId}
                      key={conversation.id}
                      onArchive={() => {
                        void handleConversationListAction(
                          conversation,
                          conversation.archivedAt ? "restore" : "archive"
                        );
                      }}
                      onDelete={() => setConfirmingDeleteConversationId(conversation.id)}
                      onPin={() => {
                        void handleConversationListAction(
                          conversation,
                          conversation.isPinned ? "unpin" : "pin"
                        );
                      }}
                      onSelect={() => {
                        setConfirmingDeleteConversationId(null);
                        setSelectedConversationId(conversation.id);
                      }}
                    />
                  ))
                ) : (
                  <p className="m-0 rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                    {hasReadyModelConnection
                      ? "还没有会话。新建单聊或群聊后，就可以让 Agent 帮你制作网页或创建 Workflow。"
                      : "当前工作区还没有可用模型连接。先完成模型连接，再开始对话。"}
                  </p>
                )}
              </div>

              {confirmingDeleteConversationId ? (
                <DeleteConversationPrompt
                  conversation={conversationList.find(
                    (conversation) => conversation.id === confirmingDeleteConversationId
                  ) ?? null}
                  deletingConversationId={deletingConversationId}
                  onCancel={() => setConfirmingDeleteConversationId(null)}
                  onConfirm={handleDeleteConversation}
                />
              ) : null}
            </>
          )}
        </aside>

        <section className="grid min-h-[72vh] grid-rows-[auto_minmax(0,1fr)_auto] rounded-[24px] border border-white/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
	          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
	            <div className="min-w-0">
	              <h2 className="m-0 truncate text-xl font-semibold text-slate-950">
		                {requiresLogin
		                  ? "登录后继续"
		                  : isInitialWorkspaceLoading
		                    ? "正在恢复会话"
		                  : selectedConversation
		                    ? selectedConversation.title
		                    : "选择一个会话"}
	              </h2>
	              <p className="m-0 mt-1 truncate text-sm text-slate-500">
		                {requiresLogin
			                  ? "登录后即可恢复会话、网页预览和可视化 Workflow。"
		                  : isInitialWorkspaceLoading
			                    ? "正在同步会话、网页预览和可视化 Workflow。"
		                  : selectedConversation
		                  ? selectedParticipantLabel
		                  : "单聊 Agent，或让多个 Agent 在群聊中协作。"}
	              </p>
	            </div>
            {shouldShowStreamStatus ? (
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  stream.connectionState === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-700"
                }`}
                role="status"
              >
                {formatStreamState(stream.connectionState)}
              </span>
            ) : null}
          </header>

	          <div className="min-h-0 overflow-y-auto px-5 py-4">
	            {errorMessage ? (
	              <p className="mt-0 rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
	                {errorMessage}
	              </p>
	            ) : null}
		            {requiresLogin ? (
		              <section className="mx-auto grid max-w-xl gap-4 py-8">
		                <AuthPanel onAuthenticated={() => void refreshWorkspaces()} />
		              </section>
		            ) : isInitialWorkspaceLoading ? (
		              <section className="mx-auto grid max-w-xl gap-4 py-8">
		                <SoftLoadingState label="正在恢复工作区" />
		              </section>
			            ) : selectedConversationId ? (
			              <div className="grid gap-4">
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
			                  isLoading={isLoadingWorkspaces || isLoadingMessages}
			                  isPinningMessageId={isPinningMessageId}
			                  liveAssistantMessage={liveAssistantMessage}
			                  liveStatus={liveOrchestratorStatus}
			                  messages={messages}
			                  onApplyDiffMessage={handleApplyDiffMessage}
			                  onQuoteMessage={handleQuoteMessage}
			                  onTogglePinMessage={handleTogglePinMessage}
			                  resolveAuthorLabel={resolveMessageAuthorLabel}
			                  suppressEmptyState={requiresLogin || !selectedConversationId}
			                />
			              </div>
            ) : (
              <ConversationWelcome
                canStart={hasReadyModelConnection}
                onCreateConversation={handleCreateConversation}
                onDraft={(draft) => setComposerDraft(draft)}
              />
            )}
	          </div>

		          {!shouldShowWorkspaceRecoveryOnly ? (
		            <div className="border-t border-slate-200/80 px-5 py-4">
		              <ChatComposer
	                disabled={!selectedConversationId || isSending}
	                disabledReason={
	                  isComposerWaitingForStream ? realtimeStreamConnectingMessage : null
	                }
	                draftContent={composerDraft}
	                onDraftApplied={() => setComposerDraft(null)}
	                onSend={handleSend}
	                participants={selectedConversation?.participants ?? []}
	                submitDisabled={isComposerWaitingForStream}
	              />
	            </div>
	          ) : null}
	        </section>

		        {!shouldShowWorkspaceRecoveryOnly ? (
		        <aside className="grid content-start gap-4 rounded-[24px] border border-white/80 bg-white/82 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:sticky xl:top-20 xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto">
          <section className="grid gap-3 rounded-[16px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-base font-semibold text-slate-950">网页预览</h2>
                <p className="m-0 mt-1 text-sm leading-6 text-slate-500">
                  HTML 产物生成后会自动显示在这里。
                </p>
              </div>
              <Button
                onClick={() =>
                  setComposerDraft("请根据当前需求制作一个响应式单文件 HTML 网页，并生成可下载产物。")
                }
                size="sm"
                variant="outline"
              >
                制作网页
              </Button>
            </div>
            {selectedHtmlArtifact ? (
              <HtmlArtifactPreview artifact={selectedHtmlArtifact} />
            ) : isLoadingMessages || isLoadingWorkflow || (isLoadingConversations && conversationList.length === 0) ? (
              <SoftLoadingState label="正在同步网页产物" />
            ) : (
              <p className="m-0 rounded-[8px] border border-dashed border-slate-200 bg-white/70 p-4 text-sm leading-7 text-slate-500">
                还没有可预览的 HTML 产物。
              </p>
            )}
          </section>

          <section className="grid gap-3 rounded-[16px] border border-slate-200 bg-white/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
	                <h2 className="m-0 text-base font-semibold text-slate-950">可视化 Workflow</h2>
	                <p className="m-0 mt-1 text-sm text-slate-500">创建可复用的节点流程。</p>
              </div>
              <Button
                onClick={() =>
                  setComposerDraft(
                    "请创建一个可视化 workflow：输入主题，生成网页大纲，生成 HTML，进行 QA 检查，最后输出可下载网页。"
                  )
                }
                size="sm"
                variant="outline"
              >
                创建 Workflow
              </Button>
            </div>
            <Button
              aria-expanded={isCodingLauncherOpen}
              onClick={() => setIsCodingLauncherOpen((current) => !current)}
              variant="secondary"
            >
	              {isCodingLauncherOpen ? "收起网页制作团队" : "打开网页制作团队"}
            </Button>
            {isCodingLauncherOpen ? (
              <WorkModeLauncher
                canStartCoding={hasReadyModelConnection}
                customAgents={codingEligibleCustomAgents}
                isLaunching={isLaunchingCodingWorkflow}
                isLoadingCustomAgents={isLoadingCustomAgents}
                onLaunchCoding={handleLaunchCodingWorkflow}
              />
            ) : null}
	            {visualWorkflows.length > 0 ? (
              <VisualWorkflowPanel
                busyWorkflowId={executingVisualWorkflowId}
                onCancel={handleCancelVisualWorkflow}
                onExecute={handleExecuteVisualWorkflow}
                onRegenerate={handleRegenerateVisualWorkflow}
                workflows={visualWorkflows}
              />
            ) : null}
          </section>

          <TimelineFiles entries={timelineFileEntries} isLoading={isLoadingMessages} />
          <PinnedTimeline
            messages={pinnedTimelineMessages}
            resolveAuthorLabel={resolveMessageAuthorLabel}
          />
	        </aside>
	        ) : null}
	      </main>
	    </div>
	  );
}

function ConversationListItem({
  conversation,
  isDeleting,
  isSelected,
  onArchive,
  onDelete,
  onPin,
  onSelect
}: {
  conversation: Conversation;
  isDeleting: boolean;
  isSelected: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onPin: () => void;
  onSelect: () => void;
}) {
  const participantLabel =
    conversation.participants.map((entry) => entry.agentName).join(", ") ||
    "未绑定 Agent";

  return (
    <article
      className={`grid gap-2 rounded-[16px] border px-3 py-3 transition ${
        isSelected
          ? "border-slate-950 bg-slate-950 text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
          : "border-slate-200 bg-white/85 text-slate-950 hover:bg-white"
      }`}
      data-archived={conversation.archivedAt ? "true" : "false"}
      data-conversation-id={conversation.id}
      data-pinned={conversation.isPinned ? "true" : "false"}
    >
      <button
        className="grid min-w-0 gap-1 text-left"
        disabled={isDeleting}
        onClick={onSelect}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          {conversation.isPinned ? (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
              置顶
            </span>
          ) : null}
          <strong className="truncate text-sm">{conversation.title}</strong>
        </span>
        <span className={`truncate text-xs ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
          {conversation.mode === "direct" ? "单聊" : "群聊"} · {participantLabel}
        </span>
      </button>
      <div className="flex flex-wrap gap-1.5">
        <button
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            isSelected
              ? "bg-white/12 text-white hover:bg-white/18"
              : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
          }`}
          onClick={onPin}
          type="button"
        >
          {conversation.isPinned ? "取消置顶" : "置顶"}
        </button>
        <button
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            isSelected
              ? "bg-white/12 text-white hover:bg-white/18"
              : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
          }`}
          onClick={onArchive}
          type="button"
        >
          {conversation.archivedAt ? "恢复" : "归档"}
        </button>
        <button
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            isSelected
              ? "bg-red-400/20 text-red-100 hover:bg-red-400/30"
              : "border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
          }`}
          disabled={isDeleting}
          onClick={onDelete}
          type="button"
        >
          删除
        </button>
      </div>
    </article>
  );
}

function DeleteConversationPrompt({
  conversation,
  deletingConversationId,
  onCancel,
  onConfirm
}: {
  conversation: Conversation | null;
  deletingConversationId: string | null;
  onCancel: () => void;
  onConfirm: (conversation: Conversation) => Promise<void>;
}) {
  if (!conversation) {
    return null;
  }

  return (
    <section className="grid gap-2 rounded-[12px] border border-red-100 bg-red-50 p-3 text-xs text-red-800">
      <p className="m-0 leading-5">再次确认后会删除这个会话及其消息记录。</p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={deletingConversationId === conversation.id}
          onClick={() => {
            void onConfirm(conversation);
          }}
          size="sm"
        >
          {deletingConversationId === conversation.id ? "删除中..." : "确认删除"}
        </Button>
        <Button
          disabled={deletingConversationId === conversation.id}
          onClick={onCancel}
          size="sm"
          variant="outline"
        >
          取消
        </Button>
      </div>
    </section>
  );
}

function ConversationWelcome({
  canStart,
  onCreateConversation,
  onDraft
}: {
  canStart: boolean;
  onCreateConversation: () => Promise<void> | void;
  onDraft: (draft: string) => void;
}) {
  return (
    <section className="grid min-h-[46vh] place-items-center">
      <div className="grid max-w-xl gap-4 text-center">
        <div>
          <h2 className="m-0 text-2xl font-semibold text-slate-950">选择或新建一个对话</h2>
          <p className="m-0 mt-3 text-sm leading-7 text-slate-600">
            单聊适合明确任务，群聊适合让多个 Agent 分工。聊天历史和置顶消息会作为上下文传递。
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={!canStart} onClick={() => void onCreateConversation()}>
            新建对话
          </Button>
          <Button
            onClick={() =>
              onDraft("请创建一个响应式单文件 HTML 网页，并在完成后生成可下载产物。")
            }
            variant="outline"
          >
            制作网页
          </Button>
          <Button
            onClick={() =>
              onDraft("请创建一个可视化 workflow，先预览节点和输入输出，等待我执行。")
            }
            variant="outline"
          >
            创建 Workflow
          </Button>
        </div>
      </div>
    </section>
  );
}

function HtmlArtifactPreview({ artifact }: { artifact: Artifact }) {
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<"error" | "loading" | "ready">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setHtml("");

    fetch(buildArtifactContentUrl(artifact.id, artifact.workspaceId), {
      credentials: "include",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("HTML 预览加载失败。");
        }
        const payload = await response.json() as { content?: unknown };
        return typeof payload.content === "string" ? payload.content : "";
      })
      .then((content) => {
        setHtml(content);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
      });

    return () => controller.abort();
  }, [artifact.id, artifact.workspaceId]);

  if (status === "loading") {
    return <SoftLoadingState label="正在打开网页预览" />;
  }

  if (status === "error" || !html) {
    return (
      <p className="m-0 rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        HTML 预览暂时无法打开。可以在文件区展开或下载产物。
      </p>
    );
  }

  return (
    <iframe
      className="h-[360px] w-full rounded-[12px] border border-slate-200 bg-white"
      sandbox="allow-scripts"
      srcDoc={html}
      title={`${artifact.title} 预览`}
    />
  );
}

function ConversationListSkeleton() {
  return (
    <div className="grid gap-2" aria-label="正在加载会话">
      {[0, 1, 2].map((index) => (
        <div
          className="h-20 rounded-[16px] bg-[linear-gradient(100deg,_rgba(241,245,249,0.65)_0%,_rgba(255,255,255,0.95)_45%,_rgba(226,232,240,0.72)_100%)] animate-pulse"
          key={index}
        />
      ))}
    </div>
  );
}

function SoftLoadingState({ label }: { label: string }) {
  return (
    <div className="grid gap-3 rounded-[12px] border border-slate-200 bg-white/72 p-4" role="status">
      <div className="h-3 w-32 rounded-full bg-[linear-gradient(100deg,_#e2e8f0,_#ffffff,_#cbd5e1)] animate-pulse" />
      <div className="h-24 rounded-[10px] bg-[linear-gradient(100deg,_rgba(226,232,240,0.75),_rgba(255,255,255,0.92),_rgba(203,213,225,0.65))] animate-pulse" />
      <p className="m-0 text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}

function TimelineFiles({
  entries,
  isLoading
}: {
  entries: TimelineFileEntry[];
  isLoading: boolean;
}) {
  return (
    <section className="grid gap-4 rounded-[16px] border border-slate-200 bg-white/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-slate-950">会话文件</h2>
          <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
            {isLoading
              ? "正在同步文件产物。"
              : entries.length > 0
                ? `当前会话已有 ${entries.length} 个文件产物。`
                : "当前会话还没有文件产物。"}
          </p>
        </div>
      </div>
      {isLoading && entries.length === 0 ? <SoftLoadingState label="正在同步文件" /> : null}
      {entries.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {entries.map(({ artifact, message }) => (
            <ArtifactCard
              artifact={artifact}
              conversationId={message.conversationId}
              key={artifact.id}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PinnedTimeline({
  messages,
  resolveAuthorLabel
}: {
  messages: Message[];
  resolveAuthorLabel: (message: Message) => string | undefined;
}) {
  return (
    <section className="grid gap-4 rounded-[16px] border border-slate-200 bg-white/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-slate-950">长期上下文</h2>
          <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
            {messages.length > 0
              ? `当前会话已有 ${messages.length} 条置顶消息，会随上下文传递给 Agent。`
              : "还没有置顶消息。可以在消息操作中 pin 关键要求。"}
          </p>
        </div>
      </div>
      {messages.length > 0 ? (
        <div className="grid gap-3">
          {messages.map((message) => (
            <article
              key={message.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span>{resolveAuthorLabel(message) ?? "AI 同事"}</span>
                <span aria-hidden="true">/</span>
                <time dateTime={toIsoDateTime(message.createdAt)}>
                  {formatTimelineDate(message.createdAt)}
                </time>
              </div>
              <p className="m-0 whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {message.content}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
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

function resolveValidConversationProviders(
  credentials: CredentialMetadata[],
  modelConnections: ModelConnection[]
): Set<SupportedConversationProvider> {
  const providers = new Set<SupportedConversationProvider>();

  for (const credential of credentials) {
    const provider = resolveConversationProviderForCredential(credential);

    if (provider) {
      providers.add(provider);
    }
  }

  if (
    modelConnections.some(
      (connection) =>
        (connection.kind === "opencode_model" || connection.kind === "deepseek_api") &&
        connection.status === "valid"
    )
  ) {
    providers.add("opencode");
  }

  return providers;
}

function buildConversationAgentOptions(
  agents: CustomAgent[],
  validProviders: Set<SupportedConversationProvider>
): ConversationAgentOption[] {
  const platformOptions = buildPlatformConversationAgentOptions(agents, validProviders);
  const customOptions = agents
    .filter(isDisplayableCustomConversationAgent)
    .map((agent) => {
      const provider = agent.provider as SupportedConversationProvider;
      const connected = validProviders.has(provider);

      return {
        agentId: agent.id,
        category: "custom",
        description: "平台自建 Agent",
        disabledReason: connected ? undefined : "未连接，去模型连接",
        id: `agent:${agent.id}`,
        label: agent.name,
        provider
      } satisfies ConversationAgentOption;
    });

  return [...platformOptions, ...customOptions];
}

function buildPlatformConversationAgentOptions(
  agents: CustomAgent[],
  validProviders: Set<SupportedConversationProvider>
): ConversationAgentOption[] {
  const options: ConversationAgentOption[] = [];

  for (const profile of platformProviderProfiles) {
    const connected = validProviders.has(profile.provider);
    const platformAgents = agents.filter(
      (agent) =>
        agent.provider === profile.provider &&
        agent.capabilityTags.includes(platformRuntimeAgentTag) &&
        !isBuiltInCodingTeammate(agent)
    );

    if (profile.provider === "opencode" && platformAgents.length > 0) {
      options.push(
        ...platformAgents.map((agent) => ({
          agentId: agent.id,
          category: "platform" as const,
          description: agent.scopeDescription ?? "可处理聊天、代码和网页产物任务。",
          disabledReason: connected ? undefined : "连接不可用，请检查模型连接",
          id: `agent:${agent.id}`,
          label: agent.name,
          provider: profile.provider
        }))
      );
      continue;
    }

    const defaultAgent = platformAgents[0] ?? null;
    options.push({
      agentId: defaultAgent?.id,
      category: "platform",
      description: defaultAgent?.scopeDescription ?? profile.description,
      disabledReason: connected ? undefined : "未连接，去模型连接",
      id: `platform:${profile.provider}`,
      label: defaultAgent?.name ?? profile.label,
      provider: profile.provider
    });
  }

  return options;
}

function findDefaultPlatformAgent(
  agents: CustomAgent[],
  provider: SupportedConversationProvider
): CustomAgent | null {
  const profile = getPlatformProviderProfile(provider);

  return (
    agents.find(
      (agent) =>
        agent.provider === provider &&
        agent.capabilityTags.includes(platformRuntimeAgentTag)
    ) ??
    agents.find((agent) => agent.provider === provider && agent.name === profile.label) ??
    null
  );
}

function getPlatformProviderProfile(provider: SupportedConversationProvider) {
  return (
    platformProviderProfiles.find((profile) => profile.provider === provider) ??
    platformProviderProfiles[0]!
  );
}

function isDisplayableCustomConversationAgent(agent: CustomAgent): boolean {
  if (!isSupportedConversationProvider(agent.provider)) {
    return false;
  }

  if (hiddenConversationAgentNames.has(agent.name)) {
    return false;
  }

  if (agent.capabilityTags.includes(platformRuntimeAgentTag)) {
    return false;
  }

  if (platformProviderProfiles.some((profile) => profile.label === agent.name)) {
    return false;
  }

  return !agent.capabilityTags.some((tag) => hiddenConversationAgentTags.has(tag));
}

function resolveConversationProviderForCredential(
  credential: CredentialMetadata
): SupportedConversationProvider | null {
  if (credential.validationState !== "valid") {
    return null;
  }

  if (credential.provider === "deepseek") {
    return "opencode";
  }

  return isSupportedConversationProvider(credential.provider) ? credential.provider : null;
}

function isSupportedConversationProvider(
  provider: ProviderCredential["provider"] | CustomAgent["provider"]
): provider is SupportedConversationProvider {
  return provider === "claude-code" || provider === "codex" || provider === "opencode";
}

function findCredentialForProvider(
  credentials: CredentialMetadata[],
  provider: SupportedConversationProvider
): CredentialMetadata | null {
  return (
    credentials.find((credential) => {
      if (credential.validationState !== "valid") {
        return false;
      }

      if (provider === "opencode") {
        return credential.provider === "opencode" || credential.provider === "deepseek";
      }

      return credential.provider === provider;
    }) ?? null
  );
}

function createHttpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function isConflictError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: unknown }).status === 409
  );
}

function asArray<T>(payload: unknown): T[] {
  return Array.isArray(payload) ? (payload as T[]) : [];
}

function buildLastConversationStorageKey(workspaceId: string): string {
  return `miaochat:last-conversation:${workspaceId}`;
}

function resolveStoredConversationId(
  workspaceId: string | null,
  conversations: Conversation[]
): string | null {
  if (!workspaceId) {
    return null;
  }

  const stored = window.localStorage.getItem(buildLastConversationStorageKey(workspaceId));

  if (!stored) {
    return null;
  }

  return conversations.some((conversation) => conversation.id === stored) ? stored : null;
}

async function readTextAttachments(files: File[]): Promise<MessageAttachmentInput[]> {
  if (files.length === 0) {
    return [];
  }

  if (files.length > messageAttachmentInputMaxCount) {
    throw new Error(`一次最多发送 ${messageAttachmentInputMaxCount} 个文本附件。`);
  }

  const attachments: MessageAttachmentInput[] = [];

  for (const file of files) {
    const mimeType = inferTextAttachmentMimeType(file);

    if (!mimeType || !isMessageAttachmentTextMimeType(mimeType)) {
      throw new Error(`暂只支持 Markdown、纯文本、代码、JSON、XML 等文本附件：${file.name}`);
    }

    if (file.size > messageAttachmentInputMaxContentChars * 4) {
      throw new Error(
        `附件过大：${file.name}。单个文本附件最多 ${formatBytes(messageAttachmentInputMaxContentChars)}。`
      );
    }

    const content = await readFileText(file);

    if (content.trim().length === 0) {
      throw new Error(`附件内容为空：${file.name}`);
    }

    if (content.length > messageAttachmentInputMaxContentChars) {
      throw new Error(
        `附件过大：${file.name}。单个文本附件最多 ${formatBytes(messageAttachmentInputMaxContentChars)}。`
      );
    }

    attachments.push({
      content,
      fileName: normalizeAttachmentFileName(file.name),
      mimeType
    });
  }

  return attachments;
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error(`读取附件失败：${file.name}`));
    reader.onload = () => {
      const result = reader.result;

      resolve(typeof result === "string" ? result : "");
    };
    reader.readAsText(file);
  });
}

function inferTextAttachmentMimeType(file: File): string | null {
  const declaredType = file.type.trim().toLowerCase();

  if (declaredType && isMessageAttachmentTextMimeType(declaredType)) {
    return declaredType;
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";

  switch (extension) {
    case "cjs":
    case "js":
    case "jsx":
    case "mjs":
      return "application/javascript";
    case "css":
      return "text/css";
    case "csv":
      return "text/csv";
    case "diff":
    case "patch":
      return "text/x-diff";
    case "htm":
    case "html":
      return "text/html";
    case "json":
      return "application/json";
    case "log":
    case "txt":
      return "text/plain";
    case "markdown":
    case "md":
      return "text/markdown";
    case "ts":
    case "tsx":
      return "application/typescript";
    case "xml":
      return "application/xml";
    case "yaml":
    case "yml":
      return "application/yaml";
    default:
      return declaredType || null;
  }
}

function normalizeAttachmentFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[\\/\r\n]+/g, "-");

  if (normalized.length <= messageAttachmentInputMaxFileNameChars) {
    return normalized || "attachment.txt";
  }

  const extensionMatch = /\.[a-z0-9]{1,12}$/i.exec(normalized);
  const extension = extensionMatch?.[0] ?? "";
  const baseLength = Math.max(
    1,
    messageAttachmentInputMaxFileNameChars - extension.length
  );

  return `${normalized.slice(0, baseLength)}${extension}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }

  return `${Math.round(bytes / 1024)}KB`;
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

function shouldClearLiveStatus(messages: Message[]): boolean {
  const latestMessage = messages.at(-1);

  return Boolean(latestMessage && latestMessage.role !== "user");
}

function formatTimelineDate(value: Date | string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function sortConversationsForInbox(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    if (Boolean(left.archivedAt) !== Boolean(right.archivedAt)) {
      return left.archivedAt ? 1 : -1;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function matchesConversationSearch(
  conversation: Conversation,
  search: string
): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const searchableText = [
    conversation.title,
    conversation.mode,
    ...conversation.participants.map((participant) => participant.agentName)
  ]
    .join(" ")
    .toLocaleLowerCase();

  return searchableText.includes(normalizedSearch);
}

function isHtmlArtifact(artifact: Artifact): boolean {
  const mimeType = artifact.mimeType.toLocaleLowerCase();

  return mimeType.includes("html") || /\.html?$/i.test(artifact.title);
}

function toIsoDateTime(value: Date | string): string {
  return new Date(value).toISOString();
}
