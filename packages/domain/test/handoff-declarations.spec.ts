import { describe, expect, it } from "vitest";

import {
  readHandoffDeclaration,
  selectNextHandoffWave,
  type OrchestratorResult,
  type OrchestratorTarget
} from "../src/orchestration/index.js";

describe("handoff declarations", () => {
  it("parses generic produces and consumes capability tags", () => {
    expect(
      readHandoffDeclaration({
        capabilityTags: [
          "编码",
          "produces:technical_handoff",
          "consumes=research_brief",
          "produces：implementation_plan",
          "produces:technical_handoff"
        ]
      })
    ).toEqual({
      consumes: ["research_brief"],
      produces: ["technical_handoff", "implementation_plan"]
    });
  });

  it("selects producers before consumers without role-name hardcoding", () => {
    const planner: OrchestratorTarget = {
      agentId: "agent_alpha",
      agentName: "Alpha",
      capabilityTags: ["produces:technical_handoff"],
      provider: "mock"
    };
    const builder: OrchestratorTarget = {
      agentId: "agent_beta",
      agentName: "Beta",
      capabilityTags: ["consumes:technical_handoff"],
      provider: "mock"
    };

    expect(
      selectNextHandoffWave({
        completedResults: [],
        remainingTargets: [builder, planner]
      })
    ).toEqual([planner]);

    const completedResults: OrchestratorResult[] = [
      {
        ...planner,
        finalContent: "handoff"
      }
    ];

    expect(
      selectNextHandoffWave({
        completedResults,
        remainingTargets: [builder]
      })
    ).toEqual([builder]);
  });

  it("keeps independent agents parallel when no declared producer can satisfy a dependency", () => {
    const independent: OrchestratorTarget = {
      agentId: "agent_independent",
      agentName: "Independent",
      capabilityTags: ["consumes:unknown_handoff"],
      provider: "mock"
    };

    expect(
      selectNextHandoffWave({
        completedResults: [],
        remainingTargets: [independent]
      })
    ).toEqual([independent]);
  });
});
