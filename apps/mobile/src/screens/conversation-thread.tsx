import type { ReactElement } from "react";

import { ApprovalCard } from "../components/approval-card";

type MobileApprovalRequest = {
  description: string;
  id: string;
  title: string;
};

type MobileAttachment = {
  id: string;
  kind: "attachment" | "image";
  previewUrl: string;
  title: string;
};

type MobileMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type ConversationThreadScreenProps = {
  approvalRequests: MobileApprovalRequest[];
  attachments: MobileAttachment[];
  messages: MobileMessage[];
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
};

export function ConversationThreadScreen({
  approvalRequests,
  attachments,
  messages,
  onApprove,
  onReject
}: ConversationThreadScreenProps): ReactElement {
  return (
    <section aria-label="Mobile conversation thread" style={{ display: "grid", gap: "1rem" }}>
      <h1>Thread</h1>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {messages.map((message) => (
          <article
            key={message.id}
            style={{
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderRadius: "16px",
              padding: "0.85rem 1rem"
            }}
          >
            <strong>{message.role}</strong>
            <p style={{ marginBottom: 0 }}>{message.text}</p>
          </article>
        ))}
      </div>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {approvalRequests.map((request) => (
          <ApprovalCard
            description={request.description}
            key={request.id}
            onApprove={() => onApprove(request.id)}
            onReject={() => onReject(request.id)}
            title={request.title}
          />
        ))}
      </div>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {attachments.map((attachment) =>
          attachment.kind === "image" ? (
            <img
              alt={`Preview attachment ${attachment.title}`}
              key={attachment.id}
              src={attachment.previewUrl}
              style={{ borderRadius: "18px", maxWidth: "100%" }}
            />
          ) : (
            <a
              aria-label={`Open attachment ${attachment.title}`}
              href={attachment.previewUrl}
              key={attachment.id}
            >
              {attachment.title}
            </a>
          )
        )}
      </div>
    </section>
  );
}
