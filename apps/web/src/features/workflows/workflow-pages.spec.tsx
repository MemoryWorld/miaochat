// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowDetailPageClient } from "./workflow-pages";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/workflows/workflow_visual"
  };
});

const workflowDefinition = {
  edges: [
    { from: "input_movie", id: "edge_input_collect", label: "电影名", to: "collect_material" },
    { from: "collect_material", id: "edge_collect_html", label: "资料", to: "html" },
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
      position: { x: 0, y: 0 },
      role: "用户输入",
      type: "input"
    },
    {
      id: "collect_material",
      inputSummary: "接收电影名。",
      label: "资料收集节点",
      outputSummary: "影片资料。",
      position: { x: 220, y: 0 },
      role: "资料收集",
      type: "collection"
    },
    {
      id: "html",
      inputSummary: "接收资料。",
      label: "HTML 生成节点",
      outputSummary: "完整 HTML。",
      position: { x: 440, y: 0 },
      role: "网页生成",
      type: "html_generation"
    },
    {
      id: "output_html",
      inputSummary: "接收 HTML。",
      label: "输出节点：HTML artifact",
      outputSummary: "可下载网页。",
      position: { x: 660, y: 0 },
      role: "文件输出",
      type: "output"
    }
  ],
  outputSchema: [
    {
      description: "最终生成并写入文件区的网页产物。",
      key: "htmlArtifact",
      label: "HTML artifact",
      mimeType: "text/html"
    }
  ]
};

const baseWorkflow = {
  conversationId: "conv_visual",
  createdAt: "2026-06-08T00:00:00.000Z",
  definition: workflowDefinition,
  description: "创建一个电影资料收集到网页生成的 workflow。",
  id: "workflow_visual",
  latestRun: null,
  ownerUserId: "user_demo",
  sourceMessageId: "msg_source",
  status: "preview",
  title: "电影资料收集到网页生成 workflow",
  updatedAt: "2026-06-08T00:00:00.000Z",
  workspaceId: "default-workspace"
};

const queuedRun = {
  completedAt: null,
  conversationId: "conv_visual",
  createdAt: "2026-06-08T00:00:01.000Z",
  error: null,
  id: "run_visual",
  inputValues: { movieName: "变形金刚真人电影" },
  nodeStates: workflowDefinition.nodes.map((node) => ({
    completedAt: null,
    error: null,
    nodeId: node.id,
    startedAt: null,
    status: "waiting"
  })),
  outputArtifactId: null,
  status: "queued",
  updatedAt: "2026-06-08T00:00:01.000Z",
  workflowId: "workflow_visual",
  workspaceId: "default-workspace"
};

describe("WorkflowDetailPageClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("requires movie input before execution and renders queued node canvas after execution starts", async () => {
    const queuedWorkflow = {
      ...baseWorkflow,
      latestRun: queuedRun,
      status: "running",
      updatedAt: "2026-06-08T00:00:01.000Z"
    };

    mockFetchByUrl({
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(200, [
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "default-workspace",
            name: "默认工作区",
            ownerUserId: "user_demo",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ])
      ],
      [`${apiBaseUrl}/visual-workflows/workflow_visual?workspaceId=default-workspace`]: [
        jsonResponse(200, baseWorkflow),
        jsonResponse(200, queuedWorkflow)
      ],
      [`${apiBaseUrl}/visual-workflows/workflow_visual/runs?workspaceId=default-workspace`]: [
        jsonResponse(200, []),
        jsonResponse(200, [queuedRun])
      ],
      [`${apiBaseUrl}/visual-workflows/workflow_visual/runs`]: [
        jsonResponse(200, queuedWorkflow)
      ]
    });

    const { container } = render(
      <WorkflowDetailPageClient
        initialWorkspaceId="default-workspace"
        workflowId="workflow_visual"
      />
    );

    expect(await screen.findByRole("heading", { name: "Workflow 详情" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "节点画布" })).toBeInTheDocument();
    expect(screen.getByText("输入节点：电影名")).toBeInTheDocument();
    expect(container.querySelector("svg path[marker-end]")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "执行 workflow" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("电影名是必填项。");
    expect(fetchMock).not.toHaveBeenCalledWith(
      `${apiBaseUrl}/visual-workflows/workflow_visual/runs`,
      expect.objectContaining({ method: "POST" })
    );

    fireEvent.change(screen.getByLabelText("电影名"), {
      target: { value: "变形金刚真人电影" }
    });
    fireEvent.click(screen.getByRole("button", { name: "执行 workflow" }));

    await waitFor(() => {
      expect(screen.getAllByText("排队中").length).toBeGreaterThan(0);
    });

    const executeCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === `${apiBaseUrl}/visual-workflows/workflow_visual/runs` &&
        typeof init === "object" &&
        init !== null &&
        init.method === "POST"
    );

    expect(executeCall).toBeDefined();
    expect(JSON.parse(String(executeCall?.[1]?.body))).toEqual({
      inputValues: { movieName: "变形金刚真人电影" },
      workspaceId: "default-workspace"
    });
  });
});

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function mockFetchByUrl(mapping: Record<string, Response[]>) {
  const counts = new Map<string, number>();

  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    const queue = mapping[url];

    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected fetch call: ${url}`);
    }

    const count = counts.get(url) ?? 0;
    counts.set(url, count + 1);

    return (queue[Math.min(count, queue.length - 1)] as Response).clone();
  });
}
