import { describe, expect, it } from "vitest";

import {
  buildCollaborationPlan,
  deriveAgentWorkOrder,
  selectHandoffIntentTargets,
  selectInitialOrchestratorTargets,
  type OrchestratorTarget
} from "../src/orchestration/index.js";

describe("channel harness routing", () => {
  it("starts from explicit human mentions without fanning out", () => {
    const targets = makeTargets();

    expect(
      selectInitialOrchestratorTargets({
        mentionedAgentIds: ["agent_engineer"],
        targets
      }).map((target) => target.agentId)
    ).toEqual(["agent_engineer"]);
  });

  it("starts every channel AI teammate for unmentioned group messages", () => {
    const targets = makeTargets();

    expect(
      selectInitialOrchestratorTargets({
        mentionedAgentIds: [],
        targets
      }).map((target) => target.agentId)
    ).toEqual(["agent_tech_lead", "agent_engineer", "agent_reviewer"]);
  });

  it("keeps stable target order when no coordinator is configured", () => {
    const targets = makeTargets().map((target) => ({
      ...target,
      capabilityTags: target.capabilityTags?.filter((tag) => tag !== "channel:coordinator")
    }));

    expect(
      selectInitialOrchestratorTargets({
        mentionedAgentIds: [],
        targets
      }).map((target) => target.agentId)
    ).toEqual(["agent_tech_lead", "agent_engineer", "agent_reviewer"]);
  });

  it("prioritizes planning teammates before execution teammates for planning goals", () => {
    const targets: OrchestratorTarget[] = [
      {
        agentId: "agent_executor",
        agentName: "执行落地同事",
        capabilityTags: ["role:implementation"],
        provider: "mock",
        systemPrompt: "负责实现、编码和落地执行。"
      },
      {
        agentId: "agent_planner",
        agentName: "方案规划同事",
        capabilityTags: ["role:planning"],
        provider: "mock",
        systemPrompt: "负责方案规划、优先级和验证清单。"
      }
    ];

    expect(
      deriveAgentWorkOrder({
        message: "请给出下一步实现优先级和验证清单。",
        targets
      }).map((target) => target.agentId)
    ).toEqual(["agent_planner", "agent_executor"]);
  });

  it("treats explicit two-step relay requests as total visible collaboration steps", () => {
    const plan = buildCollaborationPlan({
      message: "请让两位 AI 同事两步接力完成方案。",
      targets: makeTargets()
    });

    expect(plan.totalSteps).toBe(2);
  });

  it("treats explicit three-round collaboration requests as total visible collaboration steps", () => {
    expect(
      buildCollaborationPlan({
        message: "请三轮协作完成方案。",
        targets: makeTargets()
      }).totalSteps
    ).toBe(3);

    expect(
      buildCollaborationPlan({
        message: "Run this in 3 rounds with the channel teammates.",
        targets: makeTargets()
      }).totalSteps
    ).toBe(3);
  });

  it("recognizes English explicit step counts", () => {
    const plan = buildCollaborationPlan({
      message: "Please use 2 steps for this relay.",
      targets: makeTargets()
    });

    expect(plan.totalSteps).toBe(2);
  });

  it("keeps default multi-agent rounds when the prompt has no explicit step count", () => {
    const plan = buildCollaborationPlan({
      message: "请让两位 AI 同事协作完成方案。",
      targets: makeTargets()
    });

    expect(plan.totalSteps).toBeUndefined();
    expect(plan.maxRounds).toBe(2);
  });

  it("routes typed handoff intents by explicit agent id or role tag", () => {
    const targets = makeTargets();

    expect(
      selectHandoffIntentTargets({
        intent: {
          acceptanceCriteria: ["implementation turn queued"],
          constraints: ["no hardcoded colleague behavior"],
          goal: "Build the implementation",
          targetRoleKey: "software-engineer",
          type: "handoff_request"
        },
        sourceAgentId: "agent_tech_lead",
        targets
      }).map((target) => target.agentId)
    ).toEqual(["agent_engineer"]);

    expect(
      selectHandoffIntentTargets({
        completedAgentIds: ["agent_engineer"],
        intent: {
          acceptanceCriteria: ["review turn queued"],
          constraints: [],
          goal: "Review the patch",
          targetAgentId: "agent_reviewer",
          type: "handoff_request"
        },
        queuedAgentIds: [],
        sourceAgentId: "agent_engineer",
        targets
      }).map((target) => target.agentId)
    ).toEqual(["agent_reviewer"]);
  });

  it("routes typed handoff intents by participant id when available", () => {
    const targets = makeTargets();

    expect(
      selectHandoffIntentTargets({
        intent: {
          acceptanceCriteria: ["participant turn queued"],
          constraints: [],
          goal: "Continue from participant handoff",
          targetParticipantId: "participant_engineer",
          type: "handoff_request"
        },
        sourceAgentId: "agent_tech_lead",
        targets
      }).map((target) => target.agentId)
    ).toEqual(["agent_engineer"]);
  });

  it("does not route typed handoff intents to source, completed, or queued targets", () => {
    const targets = makeTargets();

    expect(
      selectHandoffIntentTargets({
        completedAgentIds: ["agent_reviewer"],
        intent: {
          acceptanceCriteria: ["only new work should be queued"],
          constraints: [],
          goal: "Continue the implementation",
          targetAgentId: "agent_reviewer",
          targetRoleKey: "software-engineer",
          type: "handoff_request"
        },
        queuedAgentIds: ["agent_engineer"],
        sourceAgentId: "agent_tech_lead",
        targets
      })
    ).toEqual([]);
  });
});

function makeTargets(): OrchestratorTarget[] {
  return [
    {
      agentId: "agent_tech_lead",
      agentName: "技术负责人",
      capabilityTags: ["channel:coordinator", "role:tech-lead"],
      provider: "mock"
    },
    {
      agentId: "agent_engineer",
      agentName: "软件工程师",
      capabilityTags: ["role:software-engineer"],
      participantId: "participant_engineer",
      provider: "mock"
    },
    {
      agentId: "agent_reviewer",
      agentName: "评审同事",
      capabilityTags: ["role:reviewer"],
      provider: "mock"
    }
  ];
}
