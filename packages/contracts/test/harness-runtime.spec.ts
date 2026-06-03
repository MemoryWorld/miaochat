import { describe, expect, it } from "vitest";

import {
  externalReceiptSchema,
  harnessPromptManifestSchema,
  harnessRunSchema,
  harnessRuntimeContextSchema,
  harnessStatePatchSchema,
  harnessStepSchema,
  statePointerSchema,
  toolCallIntentSchema
} from "../src";

const now = "2026-05-31T00:00:00.000Z";

describe("state-aware harness runtime contracts", () => {
  it("describes run, step, state pointer, and prompt manifest boundaries", () => {
    const workspacePointer = statePointerSchema.parse({
      id: "workspace_1",
      scope: "workspace",
      version: 3
    });
    const agentPointer = statePointerSchema.parse({
      id: "agent_1",
      scope: "agent"
    });
    const run = harnessRunSchema.parse({
      agentId: "agent_1",
      createdAt: now,
      currentStateSnapshotId: "snapshot_run_start",
      id: "run_1",
      initiatedByUserId: "user_1",
      latestSafeCheckpointId: "checkpoint_run_start",
      status: "planning",
      traceId: "trace_1",
      workspaceId: "workspace_1"
    });
    const manifest = harnessPromptManifestSchema.parse({
      generatedAt: now,
      id: "manifest_1",
      runId: run.id,
      sections: [
        {
          contentRef: "system:state-aware-runtime",
          id: "section_system",
          statePointers: [workspacePointer],
          title: "State-aware runtime invariants",
          trustLevel: "system",
          type: "system_invariant"
        },
        {
          contentRef: "agent:agent_1:profile",
          id: "section_agent",
          statePointers: [agentPointer],
          title: "Agent profile",
          trustLevel: "validated",
          type: "agent_profile"
        }
      ],
      statePointers: [workspacePointer, agentPointer]
    });
    const step = harnessStepSchema.parse({
      id: "step_1",
      index: 1,
      reads: manifest.statePointers,
      runId: run.id,
      startedAt: now,
      status: "completed",
      traceEventIds: ["trace_event_1"],
      type: "context_build",
      writes: []
    });

    expect(run.counters.modelCalls).toBe(0);
    expect(manifest.untrustedDataBoundary).toBe(true);
    expect(step.reads.map((pointer) => pointer.scope)).toEqual(["workspace", "agent"]);
  });

  it("keeps proposed patches and tool intents separate from committed receipts", () => {
    const target = {
      id: "artifact_1",
      scope: "artifact" as const
    };
    const patch = harnessStatePatchSchema.parse({
      afterRef: "artifact:artifact_1:proposal:v2",
      id: "patch_1",
      operation: "merge",
      runId: "run_1",
      schemaId: "artifact.diff.v1",
      stepId: "step_2",
      target,
      validation: {
        status: "pending",
        validatorId: "runtime"
      }
    });
    const intent = toolCallIntentSchema.parse({
      argsRef: "tool-intent:tool_1:args",
      createdAt: now,
      id: "tool_1",
      proposedByAgentId: "agent_1",
      runId: "run_1",
      status: "proposed",
      stepId: "step_2",
      targetStatePointers: [target],
      toolName: "repo.apply_patch_sandbox"
    });
    const receipt = externalReceiptSchema.parse({
      createdAt: now,
      id: "receipt_1",
      idempotencyKey: "run_1:tool_1",
      operation: "repo.apply_patch_sandbox",
      provider: "local-sandbox",
      runId: "run_1",
      status: "verified",
      toolExecutionId: "execution_1"
    });

    expect(patch.committed).toBe(false);
    expect(intent.status).toBe("proposed");
    expect(receipt.status).toBe("verified");
  });

  it("packages the runtime context used by worker harness prompts", () => {
    const context = harnessRuntimeContextSchema.parse({
      agentId: "agent_1",
      agentName: "软件工程师",
      conversationId: "conv_1",
      currentStateSnapshotId: "run_1:snapshot:run_start",
      latestSafeCheckpointId: "run_1:checkpoint:run_start",
      mode: "group",
      promptManifest: {
        generatedAt: now,
        id: "run_1:prompt_manifest:latest",
        runId: "run_1",
        sections: [],
        statePointers: []
      },
      runId: "run_1",
      statePointers: [],
      workspaceId: "workspace_1"
    });

    expect(context.commitPolicy).toMatchObject({
      candidateIsolation: true,
      externalWritesRequireApproval: true,
      memoryWritesRequireReview: true,
      toolOutputTreatedAsData: true
    });
  });
});
