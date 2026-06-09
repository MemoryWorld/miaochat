import type { ReactElement } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { ApprovalRequest, Artifact, Conversation, Message } from "@agenthub/contracts";

import { ApprovalCard } from "../components/approval-card.js";

type ConversationThreadScreenProps = {
  approvals: ApprovalRequest[];
  artifactsByMessageId: Record<string, Artifact[]>;
  conversation: Conversation | null;
  isApprovalBusy?: boolean;
  isLoading: boolean;
  messages: Message[];
  onApprove: (approval: ApprovalRequest) => void;
  onReject: (approval: ApprovalRequest) => void;
};

export function ConversationThreadScreen({
  approvals,
  artifactsByMessageId,
  conversation,
  isApprovalBusy = false,
  isLoading,
  messages,
  onApprove,
  onReject
}: ConversationThreadScreenProps): ReactElement {
  if (!conversation) {
    return (
      <View accessibilityLabel="Mobile conversation thread" style={styles.emptyState}>
        <Text style={styles.emptyTitle}>选择一个会话</Text>
        <Text style={styles.emptyText}>移动端用于快速查看消息、处理审批和预览产物。</Text>
      </View>
    );
  }

  return (
    <View accessibilityLabel="Mobile conversation thread" style={styles.section}>
      <View style={styles.threadHeader}>
        <Text style={styles.eyebrow}>{conversation.mode === "group" ? "群聊" : "单聊"}</Text>
        <Text style={styles.title}>{conversation.title}</Text>
      </View>

      {approvals.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>待处理审批</Text>
          {approvals.map((approval) => (
            <ApprovalCard
              description={approval.summary}
              isBusy={isApprovalBusy}
              key={approval.id}
              onApprove={() => onApprove(approval)}
              onReject={() => onReject(approval)}
              status={approval.status}
              title={approval.title}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>消息</Text>
        {isLoading ? <Text style={styles.muted}>正在同步消息...</Text> : null}
        {messages.length === 0 && !isLoading ? (
          <Text style={styles.muted}>暂无消息。</Text>
        ) : (
          messages.map((message) => (
            <View
              accessibilityLabel={`Message from ${renderAuthor(message)}`}
              key={message.id}
              style={[
                styles.message,
                message.role === "user" ? styles.userMessage : styles.assistantMessage
              ]}
            >
              <Text style={styles.messageAuthor}>{renderAuthor(message)}</Text>
              <Text style={styles.messageContent}>{message.content}</Text>
              <ArtifactPreviewList artifacts={artifactsByMessageId[message.id] ?? []} />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function ArtifactPreviewList({ artifacts }: { artifacts: Artifact[] }): ReactElement | null {
  if (artifacts.length === 0) {
    return null;
  }

  return (
    <View style={styles.artifactList}>
      {artifacts.map((artifact) => (
        <Pressable
          accessibilityRole="button"
          key={artifact.id}
          onPress={() => {
            if (artifact.previewUrl) {
              void Linking.openURL(artifact.previewUrl);
            }
          }}
          style={styles.artifactCard}
        >
          {artifact.kind === "image" && artifact.previewUrl ? (
            <Image
              accessibilityLabel={`Preview attachment ${artifact.title}`}
              source={{ uri: artifact.previewUrl }}
              style={styles.artifactImage}
            />
          ) : null}
          <View style={styles.artifactText}>
            <Text style={styles.artifactTitle}>{artifact.title}</Text>
            <Text style={styles.artifactMeta}>{renderArtifactKind(artifact.kind)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function renderAuthor(message: Message): string {
  if (message.author) {
    return message.author.displayName;
  }

  switch (message.role) {
    case "assistant":
      return "AI 同事";
    case "system":
      return "系统";
    case "user":
      return "我";
  }
}

function renderArtifactKind(kind: Artifact["kind"]): string {
  switch (kind) {
    case "attachment":
      return "文件附件";
    case "diff":
      return "代码 Diff";
    case "image":
      return "图片预览";
    case "preview":
      return "网页预览";
  }
}

const styles = StyleSheet.create({
  artifactCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#dbe3ef",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden"
  },
  artifactImage: {
    aspectRatio: 16 / 9,
    backgroundColor: "#e2e8f0",
    width: "100%"
  },
  artifactList: {
    gap: 10,
    marginTop: 12
  },
  artifactMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  artifactText: {
    padding: 10
  },
  artifactTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800"
  },
  assistantMessage: {
    backgroundColor: "#ffffff"
  },
  block: {
    gap: 10
  },
  blockTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  emptyState: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ef",
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 18
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 22
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  eyebrow: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  message: {
    borderColor: "#dbe3ef",
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 14
  },
  messageAuthor: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800"
  },
  messageContent: {
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 22
  },
  muted: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 22
  },
  section: {
    gap: 18
  },
  threadHeader: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ef",
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 16
  },
  title: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
  },
  userMessage: {
    backgroundColor: "#eff6ff"
  }
});
