// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeammateActorPage } from "./teammate-actor-page";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/teammates/tech_lead"
  };
});

describe("TeammateActorPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("loads all actor-scoped surfaces with one teammate scope and renders the selected tab", async () => {
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
      [`${apiBaseUrl}/actor-profile?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, {
          agentId: null,
          avatarUrl: null,
          builtInRole: "tech_lead",
          capabilityTags: ["编码", "计划"],
          channelMemberships: [
            {
              channelId: "conv_phase_d",
              title: "Phase D 频道",
              visibility: "workspace"
            }
          ],
          executionPlane: "in_process",
          id: "tech_lead",
          kind: "builtin",
          mission: "先梳理目标，再提交计划等待用户确认。",
          name: "技术负责人",
          runtimeBackend: "enhanced-hermes",
          summary: "负责需求澄清、计划拆解和风险把控。",
          workspaceId: "default-workspace"
        })
      ],
      [`${apiBaseUrl}/tasks?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            channelId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            dueAt: null,
            id: "task_plan",
            ownerScope: "workflow",
            ownerScopeId: "workflow_phase_d",
            priority: "high",
            sourceKind: "coding_workflow",
            state: "in_review",
            summary: "提交计划并等待确认。",
            teammateId: "tech_lead",
            title: "技术负责人提交计划",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workflowId: "workflow_phase_d",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/activity?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            actingTeammateId: "tech_lead",
            actingTeammateName: "技术负责人",
            approvalRequestId: "approval_phase_d",
            channelId: "conv_phase_d",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            endedAt: null,
            id: "round_plan",
            metadata: {},
            outputPreview: null,
            phase: "planning",
            startedAt: "2026-05-29T00:00:00.000Z",
            status: "waiting_for_approval",
            steps: [],
            summary: "技术负责人已提交首版计划。",
            toolActivityPreview: "计划整理与风险拆解",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workflowId: "workflow_phase_d",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/calendar?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            channelId: "conv_phase_d",
            endAt: null,
            id: "cal_phase_d",
            ownerScope: "workflow",
            ownerScopeId: "workflow_phase_d",
            startAt: "2026-05-29T00:00:00.000Z",
            status: "scheduled",
            summary: "计划审批事件",
            teammateId: "tech_lead",
            title: "计划审批",
            workflowId: "workflow_phase_d",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/channels?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            conversationId: "conv_phase_d",
            id: "conv_phase_d",
            memberTeammateIds: ["tech_lead", "software_engineer"],
            sourceType: "conversation",
            summary: "2 位协作成员共享这个频道。",
            title: "Phase D 频道",
            unreadCount: 0,
            updatedAt: "2026-05-29T00:00:00.000Z",
            visibility: "workspace",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/actor-files?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            channelId: "conv_phase_d",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "file_phase_d",
            kind: "attachment",
            messageId: "msg_phase_d",
            mimeType: "text/markdown",
            previewUrl: null,
            title: "计划附件",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/skills?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            category: "流程",
            id: "planning-and-approval",
            name: "计划与审批",
            runtimeBackendIds: ["built-in-collaboration"],
            status: "active",
            summary: "负责拆解计划、整理风险，并把关键节点提交给用户确认。",
            teammateIds: ["tech_lead"],
            workspaceEnabled: true,
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/memory?teammateId=tech_lead&workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            content: "优先固定范围边界。",
            conversationId: "conv_phase_d",
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "memory_phase_d",
            scope: "actor",
            source: "manual",
            teammateId: "tech_lead",
            title: "范围提示",
            updatedAt: "2026-05-29T00:00:00.000Z",
            workspaceId: "default-workspace"
          }
        ])
      ]
    });

    render(<TeammateActorPage initialTab="activity" teammateId="tech_lead" />);

    expect(await screen.findByText("技术负责人已提交首版计划。")).toBeInTheDocument();
    expect(screen.getByText("技术负责人")).toBeInTheDocument();
    expect(screen.getByText("planning")).toBeInTheDocument();

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([url]) => url);
      expect(requestedUrls).toEqual(
        expect.arrayContaining([
          `${apiBaseUrl}/actor-profile?teammateId=tech_lead&workspaceId=default-workspace`,
          `${apiBaseUrl}/tasks?teammateId=tech_lead&workspaceId=default-workspace`,
          `${apiBaseUrl}/activity?teammateId=tech_lead&workspaceId=default-workspace`,
          `${apiBaseUrl}/calendar?teammateId=tech_lead&workspaceId=default-workspace`,
          `${apiBaseUrl}/channels?teammateId=tech_lead&workspaceId=default-workspace`,
          `${apiBaseUrl}/actor-files?teammateId=tech_lead&workspaceId=default-workspace`,
          `${apiBaseUrl}/skills?teammateId=tech_lead&workspaceId=default-workspace`,
          `${apiBaseUrl}/memory?teammateId=tech_lead&workspaceId=default-workspace`
        ])
      );
    });
  });
});

function mockFetchByUrl(mapping: Record<string, Response[]>) {
  fetchMock.mockImplementation(async (input) => {
    const url = toRequestUrl(input);
    const queue = mapping[url];

    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected fetch: ${url}`);
    }

    return queue.shift()!;
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function toRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}
