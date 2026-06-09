"use client";

import type { OrchestratorStatusEventPayload } from "@agenthub/contracts";

type SystemStatusCardProps = {
  event: OrchestratorStatusEventPayload;
};

export function SystemStatusCard({ event }: SystemStatusCardProps) {
  const accentColor =
    event.state === "failed"
      ? "#b42318"
      : event.state === "succeeded"
        ? "#175cd3"
        : "#475467";
  const backgroundColor =
    event.state === "failed"
      ? "rgba(254, 228, 226, 0.72)"
      : event.state === "succeeded"
        ? "rgba(217, 239, 255, 0.76)"
        : "rgba(243, 244, 246, 0.92)";

  return (
    <article
      style={{
        background: backgroundColor,
        border: `1px solid ${accentColor}22`,
        borderRadius: "18px",
        justifySelf: "start",
        maxWidth: "80%",
        padding: "0.85rem 1rem"
      }}
    >
      <div
        style={{
          color: accentColor,
          fontSize: "0.8rem",
          fontWeight: 700,
          letterSpacing: "0.02em",
          marginBottom: "0.35rem",
          textTransform: "uppercase"
        }}
      >
        {formatStatusHeading(event.label)}
      </div>
      {event.activeAgentName ? (
        <div
          style={{
            color: "#344054",
            fontSize: "0.82rem",
            marginBottom: "0.35rem"
          }}
        >
          当前处理：{event.activeAgentName}
        </div>
      ) : null}
      <div
        style={{
          color: "#101828",
          lineHeight: 1.6
        }}
      >
        {event.summary ?? buildFallbackSummary(event)}
      </div>
      {event.failures.length > 0 ? (
        <ul
          style={{
            color: "#344054",
            lineHeight: 1.5,
            margin: "0.7rem 0 0",
            paddingLeft: "1.2rem"
          }}
        >
          {event.failures.map((failure) => (
            <li key={`${event.label}:${failure.agentId}`}>
              {failure.agentName} · {failure.code}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function buildFallbackSummary(event: OrchestratorStatusEventPayload): string {
  if (event.state === "failed") {
    return `处理 ${event.totalAgentCount} 位 AI 同事时报告 ${event.failures.length} 个失败。`;
  }

  if (event.state === "succeeded") {
    return `已完成 ${event.successfulAgentCount}/${event.totalAgentCount} 位 AI 同事的结果。`;
  }

  return `正在处理 ${event.totalAgentCount} 位 AI 同事的任务。`;
}

function formatStatusHeading(label: OrchestratorStatusEventPayload["label"]): string {
  switch (label) {
    case "coding.plan_pending_approval":
      return "计划待确认";
    case "coding.plan_revision_requested":
      return "计划已回修";
    case "coding.plan_rejected":
      return "计划已拒绝";
    case "coding.execution_started":
      return "执行阶段";
    case "coding.review_started":
      return "评审阶段";
    case "coding.qa_started":
      return "测试阶段";
    case "coding.summary_started":
      return "技术负责人汇总";
    case "coding.awaiting_user_confirmation":
      return "等待用户确认";
    case "coding.completed":
      return "工作流完成";
    default:
      return label.replace("orchestrator.", "Orchestrator ").replace(/_/g, " ");
  }
}
