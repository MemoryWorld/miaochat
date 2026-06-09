import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import type { ApprovalRequest, Artifact, Conversation, Message, Workspace } from "@agenthub/contracts";

import { ConversationListScreen } from "../screens/conversation-list.js";
import { ConversationThreadScreen } from "../screens/conversation-thread.js";
import type { MobileApiClient, MobileAuthSession } from "../lib/mobile-api.js";

type MobileShellProps = {
  api: MobileApiClient;
  apiBaseUrl: string;
  onApiBaseUrlChange: (value: string) => void;
};

export function MobileShell({
  api,
  apiBaseUrl,
  onApiBaseUrlChange
}: MobileShellProps): ReactElement {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [artifactsByMessageId, setArtifactsByMessageId] = useState<
    Record<string, Artifact[]>
  >({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApprovalBusy, setIsApprovalBusy] = useState(false);
  const [isLoadingShell, setIsLoadingShell] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [password, setPassword] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [session, setSession] = useState<MobileAuthSession>({ authenticated: false });
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedConversationId) ??
      null,
    [conversations, selectedConversationId]
  );
  const threadApprovals = approvals.filter(
    (approval) => approval.conversationId === selectedConversationId
  );

  useEffect(() => {
    let isActive = true;

    async function boot(): Promise<void> {
      setIsLoadingShell(true);
      setErrorMessage(null);

      try {
        const nextSession = await api.loadSession();

        if (!isActive) {
          return;
        }

        setSession(nextSession);

        if (nextSession.authenticated) {
          await loadWorkspaceData();
        }
      } catch {
        if (isActive) {
          setSession({ authenticated: false });
        }
      } finally {
        if (isActive) {
          setIsLoadingShell(false);
        }
      }
    }

    void boot();

    return () => {
      isActive = false;
    };
  }, [api]);

  useEffect(() => {
    if (workspaceId) {
      void loadConversationData(workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId && selectedConversationId) {
      void loadThread(workspaceId, selectedConversationId);
    }
  }, [workspaceId, selectedConversationId]);

  async function loadWorkspaceData(): Promise<void> {
    const nextWorkspaces = await api.listWorkspaces();
    const nextWorkspaceId = nextWorkspaces[0]?.id ?? "default-workspace";

    setWorkspaces(nextWorkspaces);
    setWorkspaceId((current) =>
      current && nextWorkspaces.some((workspace) => workspace.id === current)
        ? current
        : nextWorkspaceId
    );
    await loadConversationData(nextWorkspaceId);
  }

  async function loadConversationData(nextWorkspaceId = workspaceId): Promise<void> {
    if (!nextWorkspaceId) {
      return;
    }

    try {
      const [nextConversations, nextApprovals] = await Promise.all([
        api.listConversations(nextWorkspaceId),
        api.listApprovals({ workspaceId: nextWorkspaceId })
      ]);

      setConversations(nextConversations);
      setApprovals(nextApprovals);
      setSelectedConversationId((current) =>
        current && nextConversations.some((conversation) => conversation.id === current)
          ? current
          : nextConversations[0]?.id ?? null
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "无法同步移动端数据。");
    }
  }

  async function loadThread(nextWorkspaceId: string, conversationId: string): Promise<void> {
    setIsLoadingThread(true);

    try {
      const nextMessages = await api.listMessages({
        conversationId,
        workspaceId: nextWorkspaceId
      });
      const artifactEntries = await Promise.all(
        nextMessages.map(async (message) => [
          message.id,
          await api.listArtifacts({
            messageId: message.id,
            workspaceId: nextWorkspaceId
          })
        ] as const)
      );

      setMessages(nextMessages);
      setArtifactsByMessageId(Object.fromEntries(artifactEntries));
      setErrorMessage(null);
    } catch (error) {
      setMessages([]);
      setArtifactsByMessageId({});
      setErrorMessage(error instanceof Error ? error.message : "无法加载会话。");
    } finally {
      setIsLoadingThread(false);
    }
  }

  async function submitLogin(): Promise<void> {
    setIsSubmittingLogin(true);
    setErrorMessage(null);

    try {
      const nextSession = await api.login({
        email,
        password
      });

      setSession(nextSession);
      setPassword("");

      if (nextSession.authenticated) {
        await loadWorkspaceData();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登录失败。");
    } finally {
      setIsSubmittingLogin(false);
    }
  }

  async function decideApproval(
    approval: ApprovalRequest,
    decision: "approved" | "rejected"
  ): Promise<void> {
    if (!approval.workflowId || !workspaceId) {
      setErrorMessage("这个审批缺少工作流信息，无法在移动端处理。");
      return;
    }

    setIsApprovalBusy(true);
    setErrorMessage(null);

    try {
      await api.decideWorkflow({
        decision,
        note: decision === "rejected" ? "移动端驳回。" : undefined,
        workflowId: approval.workflowId,
        workspaceId
      });
      await loadConversationData(workspaceId);

      if (selectedConversationId) {
        await loadThread(workspaceId, selectedConversationId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "审批处理失败。");
    } finally {
      setIsApprovalBusy(false);
    }
  }

  if (isLoadingShell) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>正在同步 Miaochat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session.authenticated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <View style={styles.loginCard}>
            <Text style={styles.brand}>Miaochat</Text>
            <Text style={styles.loginTitle}>移动端审批与预览</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="url"
              onChangeText={onApiBaseUrlChange}
              placeholder="API 地址"
              style={styles.input}
              value={apiBaseUrl}
            />
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="邮箱"
              style={styles.input}
              value={email}
            />
            <TextInput
              onChangeText={setPassword}
              placeholder="密码"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={isSubmittingLogin || email.length === 0 || password.length === 0}
              onPress={() => void submitLogin()}
              style={({ pressed }) => [
                styles.primaryButton,
                (isSubmittingLogin || email.length === 0 || password.length === 0) &&
                  styles.disabledButton,
                pressed && styles.pressedButton
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmittingLogin ? "登录中..." : "登录"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.shellContainer}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brand}>Miaochat</Text>
            <Text style={styles.userText}>{session.user.displayName}</Text>
          </View>
          <Text style={styles.apiText}>{apiBaseUrl}</Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {workspaces.length > 1 ? (
          <View style={styles.workspaceRow}>
            {workspaces.map((workspace) => (
              <Pressable
                accessibilityRole="button"
                key={workspace.id}
                onPress={() => setWorkspaceId(workspace.id)}
                style={[
                  styles.workspaceButton,
                  workspace.id === workspaceId && styles.workspaceButtonActive
                ]}
              >
                <Text
                  style={[
                    styles.workspaceButtonText,
                    workspace.id === workspaceId && styles.workspaceButtonTextActive
                  ]}
                >
                  {workspace.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <ConversationListScreen
          conversations={conversations}
          onRefresh={() => void loadConversationData()}
          onSelectConversation={setSelectedConversationId}
          selectedConversationId={selectedConversationId}
        />

        <ConversationThreadScreen
          approvals={threadApprovals}
          artifactsByMessageId={artifactsByMessageId}
          conversation={selectedConversation}
          isApprovalBusy={isApprovalBusy}
          isLoading={isLoadingThread}
          messages={messages}
          onApprove={(approval) => void decideApproval(approval, "approved")}
          onReject={(approval) => void decideApproval(approval, "rejected")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  apiText: {
    color: "#64748b",
    flex: 1,
    fontSize: 12,
    textAlign: "right"
  },
  brand: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0
  },
  centerState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  centerTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800"
  },
  disabledButton: {
    opacity: 0.45
  },
  errorText: {
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    color: "#991b1b",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: 12
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  loginCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ef",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 18
  },
  loginTitle: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4
  },
  pressedButton: {
    opacity: 0.78
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  safeArea: {
    backgroundColor: "#f8fafc",
    flex: 1
  },
  shellContainer: {
    gap: 18,
    padding: 14,
    paddingBottom: 30
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  userText: {
    color: "#475569",
    fontSize: 13,
    marginTop: 2
  },
  workspaceButton: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  workspaceButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a"
  },
  workspaceButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  workspaceButtonTextActive: {
    color: "#ffffff"
  },
  workspaceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
