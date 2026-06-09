import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Conversation } from "@agenthub/contracts";

type ConversationListScreenProps = {
  conversations: Conversation[];
  onRefresh: () => void;
  onSelectConversation: (conversationId: string) => void;
  selectedConversationId: string | null;
};

export function ConversationListScreen({
  conversations,
  onRefresh,
  onSelectConversation,
  selectedConversationId
}: ConversationListScreenProps): ReactElement {
  return (
    <View accessibilityLabel="Mobile conversation list" style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>会话</Text>
          <Text style={styles.title}>移动 IM</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>刷新</Text>
        </Pressable>
      </View>
      <View style={styles.list}>
        {conversations.length === 0 ? (
          <Text style={styles.empty}>暂无会话。请先在 Web 端创建或启动编码工作流。</Text>
        ) : (
          conversations.map((conversation) => {
            const isSelected = conversation.id === selectedConversationId;

            return (
              <Pressable
                accessibilityRole="button"
                key={conversation.id}
                onPress={() => onSelectConversation(conversation.id)}
                style={({ pressed }) => [
                  styles.item,
                  isSelected && styles.selectedItem,
                  pressed && styles.pressedItem
                ]}
              >
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemTitle}>{conversation.title}</Text>
                  {conversation.isPinned ? <Text style={styles.pin}>置顶</Text> : null}
                </View>
                <Text style={styles.itemMeta}>
                  {conversation.mode === "group" ? "群聊协作" : "单聊"} ·{" "}
                  {conversation.participants.map((member) => member.agentName).join("、") ||
                    "AI 同事"}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 22
  },
  eyebrow: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  item: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ef",
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 14
  },
  itemMeta: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18
  },
  itemTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 15,
    fontWeight: "800"
  },
  itemTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  list: {
    gap: 10
  },
  pin: {
    backgroundColor: "#e0f2fe",
    borderRadius: 999,
    color: "#075985",
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  pressedItem: {
    opacity: 0.78
  },
  refreshButton: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  section: {
    gap: 14
  },
  selectedItem: {
    borderColor: "#0f172a"
  },
  title: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
  }
});
