import type { ReactElement } from "react";

type ApprovalCardProps = {
  description: string;
  onApprove: () => void;
  onReject: () => void;
  title: string;
};

export function ApprovalCard({
  description,
  onApprove,
  onReject,
  title
}: ApprovalCardProps): ReactElement {
  return (
    <article
      style={{
        border: "1px solid rgba(15, 23, 42, 0.08)",
        borderRadius: "20px",
        display: "grid",
        gap: "0.75rem",
        padding: "1rem"
      }}
    >
      <div>
        <strong>{title}</strong>
        <p style={{ marginBottom: 0 }}>{description}</p>
      </div>
      <div style={{ display: "flex", gap: "0.65rem" }}>
        <button type="button" onClick={onApprove}>
          Approve
        </button>
        <button type="button" onClick={onReject}>
          Reject
        </button>
      </div>
    </article>
  );
}
