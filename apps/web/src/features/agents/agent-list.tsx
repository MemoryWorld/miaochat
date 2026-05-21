import type { CustomAgent } from "@agenthub/contracts";

type AgentListProps = {
  agents: CustomAgent[];
};

export function AgentList({ agents }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <p style={{ color: "#475467", lineHeight: 1.6, marginBottom: 0 }}>
        No custom agents have been saved yet.
      </p>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "0.85rem"
      }}
    >
      {agents.map((agent) => (
        <article
          key={agent.id}
          style={{
            background: "#ffffff",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            borderRadius: "20px",
            display: "grid",
            gap: "0.55rem",
            padding: "1rem"
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "0.8rem",
              justifyContent: "space-between"
            }}
          >
            <div>
              <strong style={{ color: "#101828" }}>{agent.name}</strong>
              <div style={{ color: "#667085", fontSize: "0.9rem", marginTop: "0.2rem" }}>
                {agent.provider}
              </div>
            </div>
            {agent.avatarUrl ? (
              <span style={badgeStyle}>avatar linked</span>
            ) : (
              <span style={badgeStyle}>text-only</span>
            )}
          </div>
          <p style={{ color: "#344054", lineHeight: 1.6, margin: 0 }}>
            {agent.systemPrompt}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {agent.capabilityTags.length === 0 ? (
              <span style={tagStyle}>no tags</span>
            ) : (
              agent.capabilityTags.map((tag) => (
                <span key={tag} style={tagStyle}>
                  {tag}
                </span>
              ))
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

const badgeStyle = {
  background: "rgba(15, 23, 42, 0.06)",
  borderRadius: "999px",
  color: "#475467",
  fontSize: "0.8rem",
  fontWeight: 600,
  padding: "0.35rem 0.65rem"
} as const;

const tagStyle = {
  background: "rgba(11, 110, 255, 0.08)",
  borderRadius: "999px",
  color: "#0b6eff",
  fontSize: "0.82rem",
  fontWeight: 600,
  padding: "0.35rem 0.65rem"
} as const;
