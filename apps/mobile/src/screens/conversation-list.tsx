import type { ReactElement } from "react";

type MobileConversationListItem = {
  id: string;
  subtitle: string;
  title: string;
};

type ConversationListScreenProps = {
  conversations: MobileConversationListItem[];
};

export function ConversationListScreen({
  conversations
}: ConversationListScreenProps): ReactElement {
  return (
    <section aria-label="Mobile conversation list">
      <h1>Conversations</h1>
      <ul style={{ display: "grid", gap: "0.75rem", listStyle: "none", padding: 0 }}>
        {conversations.map((conversation) => (
          <li
            key={conversation.id}
            style={{
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderRadius: "18px",
              padding: "0.9rem 1rem"
            }}
          >
            <strong>{conversation.title}</strong>
            <div style={{ color: "#475467", marginTop: "0.25rem" }}>
              {conversation.subtitle}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
