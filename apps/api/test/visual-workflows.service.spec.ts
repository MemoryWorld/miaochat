import { afterEach, describe, expect, it, vi } from "vitest";

import { VisualWorkflowsService } from "../src/modules/visual-workflows/visual-workflows.service.js";

const createdAt = new Date("2026-06-08T00:00:00.000Z");
const definition = {
  edges: [
    { from: "input_movie", id: "edge_input_collect", label: "电影名", to: "html" },
    { from: "html", id: "edge_html_output", label: "HTML", to: "output_html" }
  ],
  inputSchema: [
    {
      description: "用于资料收集和网页生成的电影名称。",
      key: "movieName",
      label: "电影名",
      placeholder: "例如：变形金刚真人电影",
      required: true
    }
  ],
  nodes: [
    {
      id: "input_movie",
      inputSummary: "用户输入电影名。",
      label: "输入节点：电影名",
      outputSummary: "标准化后的电影名。",
      role: "用户输入",
      type: "input"
    },
    {
      id: "html",
      inputSummary: "接收电影名。",
      label: "HTML 生成节点",
      outputSummary: "完整单文件 HTML。",
      role: "网页生成",
      type: "html_generation"
    },
    {
      id: "output_html",
      inputSummary: "接收 HTML。",
      label: "输出节点：HTML artifact",
      outputSummary: "可下载网页。",
      role: "文件输出",
      type: "output"
    }
  ],
  outputSchema: [
    { key: "htmlArtifact", label: "HTML artifact", mimeType: "text/html" }
  ]
};

function buildWorkflowRow(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: "conv_visual",
    created_at: createdAt,
    definition,
    description: "创建一个电影资料 workflow",
    id: "visual_workflow",
    latest_run_completed_at: null,
    latest_run_created_at: null,
    latest_run_error: null,
    latest_run_id: null,
    latest_run_input_values: null,
    latest_run_node_states: null,
    latest_run_output_artifact_id: null,
    latest_run_status: null,
    latest_run_updated_at: null,
    owner_user_id: "user_owner",
    source_message_id: "msg_source",
    status: "preview",
    title: "电影资料收集到网页生成 workflow",
    updated_at: createdAt,
    workspace_id: "workspace_1",
    ...overrides
  };
}

function createService(database: { execute: ReturnType<typeof vi.fn> }) {
  const artifactsService = {
    createRuntimeWebpageArtifact: vi.fn()
  };
  const channelMembersService = {
    assertCanRead: vi.fn(async () => ({
      channelId: "conv_visual",
      ownerUserId: "user_owner",
      permission: "manage",
      workspaceId: "workspace_1"
    })),
    assertCanSend: vi.fn(async () => ({
      channelId: "conv_visual",
      ownerUserId: "user_owner",
      permission: "manage",
      workspaceId: "workspace_1"
    }))
  };

  return {
    artifactsService,
    service: new VisualWorkflowsService(
      artifactsService as never,
      channelMembersService as never,
      database as never
    )
  };
}

describe("VisualWorkflowsService", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("rejects execution when required workflow inputs are missing", async () => {
    const database = {
      execute: vi.fn().mockResolvedValueOnce({ rows: [buildWorkflowRow()] })
    };
    const { artifactsService, service } = createService(database);

    await expect(
      service.execute(
        "visual_workflow",
        {
          inputValues: {},
          workspaceId: "workspace_1"
        },
        "user_owner"
      )
    ).rejects.toThrow("电影名是必填项。");

    expect(artifactsService.createRuntimeWebpageArtifact).not.toHaveBeenCalled();
    expect(database.execute).toHaveBeenCalledTimes(1);
  });

  it("starts execution asynchronously and returns a queued run with user input values", async () => {
    vi.useFakeTimers();
    const queuedAt = new Date("2026-06-08T00:00:01.000Z");
    const queuedWorkflowRow = buildWorkflowRow({
      latest_run_created_at: queuedAt,
      latest_run_id: "run_visual",
      latest_run_input_values: { movieName: "星际穿越" },
      latest_run_node_states: definition.nodes.map((node) => ({
        completedAt: null,
        error: null,
        nodeId: node.id,
        startedAt: null,
        status: "waiting"
      })),
      latest_run_status: "queued",
      latest_run_updated_at: queuedAt,
      status: "running",
      updated_at: queuedAt
    });
    const database = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [buildWorkflowRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [queuedWorkflowRow] })
    };
    const { artifactsService, service } = createService(database);

    const workflow = await service.execute(
      "visual_workflow",
      {
        inputValues: { movieName: "星际穿越" },
        workspaceId: "workspace_1"
      },
      "user_owner"
    );

    expect(workflow.status).toBe("running");
    expect(workflow.latestRun).toEqual(
      expect.objectContaining({
        inputValues: { movieName: "星际穿越" },
        outputArtifactId: null,
        status: "queued"
      })
    );
    expect(artifactsService.createRuntimeWebpageArtifact).not.toHaveBeenCalled();
  });

  it("rejects duplicate execution while a run is queued or running", async () => {
    const database = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [buildWorkflowRow()] })
        .mockResolvedValueOnce({ rows: [{ id: "run_active", status: "running" }] })
    };
    const { service } = createService(database);

    await expect(
      service.execute(
        "visual_workflow",
        {
          inputValues: { movieName: "星际穿越" },
          workspaceId: "workspace_1"
        },
        "user_owner"
      )
    ).rejects.toThrow("这个 workflow 已经在执行中。");
  });
});
