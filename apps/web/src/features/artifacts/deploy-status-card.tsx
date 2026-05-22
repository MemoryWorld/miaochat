"use client";

import type { Artifact, Deployment, DeployTargetSummary } from "@agenthub/contracts";

type DeployStatusCardProps = {
  artifact: Artifact;
  deployment: Deployment;
  target: DeployTargetSummary;
};

export function DeployStatusCard({
  artifact,
  deployment,
  target
}: DeployStatusCardProps) {
  const latestEvent =
    deployment.progressEvents[deployment.progressEvents.length - 1] ?? null;

  return (
    <article
      aria-label={`Deploy status card for ${artifact.title}`}
      data-deploy-status={deployment.status}
      style={cardStyle}
    >
      <header style={headerStyle}>
        <div style={{ display: "grid", gap: "0.35rem" }}>
          <span style={eyebrowStyle}>Deploy</span>
          <strong style={titleStyle}>{target.name}</strong>
        </div>
        <span style={statusBadgeStyle(deployment.status)}>
          {formatStatus(deployment.status)}
        </span>
      </header>
      <div style={metaGridStyle}>
        <div>
          Artifact:{" "}
          <a href={`#artifact-${artifact.id}`} style={linkStyle}>
            {artifact.title}
          </a>
        </div>
        <div>Target kind: {formatTargetKind(target.kind)}</div>
      </div>
      <p style={messageStyle}>{latestEvent?.message ?? deployment.resultMessage}</p>
      {deployment.previewUrl ? (
        <a
          href={deployment.previewUrl}
          rel="noreferrer"
          style={previewLinkStyle}
          target="_blank"
        >
          {deployment.previewUrl}
        </a>
      ) : null}
      <div style={timelineStyle}>
        {deployment.progressEvents.map((event) => (
          <span key={`${deployment.id}:${event.label}:${event.at}`} style={timelineBadgeStyle}>
            {event.label.replace("deployment.", "")}
          </span>
        ))}
      </div>
    </article>
  );
}

const cardStyle = {
  background: "rgba(236, 253, 243, 0.72)",
  border: "1px solid rgba(18, 183, 106, 0.18)",
  borderRadius: "20px",
  display: "grid",
  gap: "0.75rem",
  padding: "1rem 1.1rem"
} as const;

const headerStyle = {
  alignItems: "start",
  display: "flex",
  gap: "0.8rem",
  justifyContent: "space-between"
} as const;

const eyebrowStyle = {
  color: "#027a48",
  fontSize: "0.74rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase"
} as const;

const titleStyle = {
  color: "#101828",
  fontSize: "1rem"
} as const;

const metaGridStyle = {
  color: "#344054",
  display: "grid",
  fontSize: "0.86rem",
  gap: "0.35rem"
} as const;

const messageStyle = {
  color: "#101828",
  lineHeight: 1.6,
  margin: 0
} as const;

const linkStyle = {
  color: "#175cd3",
  textDecoration: "none"
} as const;

const previewLinkStyle = {
  color: "#0b6eff",
  fontSize: "0.86rem",
  overflowWrap: "anywhere",
  textDecoration: "none"
} as const;

const timelineStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem"
} as const;

const timelineBadgeStyle = {
  background: "rgba(16, 24, 40, 0.08)",
  borderRadius: "999px",
  color: "#344054",
  fontSize: "0.74rem",
  fontWeight: 600,
  padding: "0.2rem 0.55rem"
} as const;

function statusBadgeStyle(status: Deployment["status"]) {
  const palette =
    status === "succeeded"
      ? {
          background: "rgba(18, 183, 106, 0.14)",
          color: "#027a48"
        }
      : status === "failed"
        ? {
            background: "rgba(217, 45, 32, 0.12)",
            color: "#b42318"
          }
        : status === "running"
          ? {
              background: "rgba(47, 128, 237, 0.14)",
              color: "#175cd3"
            }
          : {
              background: "rgba(15, 23, 42, 0.08)",
              color: "#344054"
            };

  return {
    ...palette,
    borderRadius: "999px",
    fontSize: "0.76rem",
    fontWeight: 700,
    padding: "0.28rem 0.65rem",
    textTransform: "uppercase"
  } as const;
}

function formatStatus(status: Deployment["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
  }
}

function formatTargetKind(kind: DeployTargetSummary["kind"]): string {
  switch (kind) {
    case "static-site":
      return "Static site";
    case "container":
      return "Container";
    case "source-archive":
      return "Source archive";
  }
}
