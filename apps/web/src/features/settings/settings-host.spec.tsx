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

import { SettingsHost } from "./settings-host";

const fetchMock = vi.fn<typeof fetch>();
const apiBaseUrl = "/api";

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/settings"
  };
});

vi.mock("../auth/auth-panel", () => ({
  AuthPanel: ({
    onAuthenticated,
    onLoggedOut
  }: {
    onAuthenticated?: () => void;
    onLoggedOut?: () => void;
  }) => (
    <div>
      <span>Mock Auth Panel</span>
      <button onClick={() => onAuthenticated?.()} type="button">
        Mock login success
      </button>
      <button onClick={() => onLoggedOut?.()} type="button">
        Mock logout success
      </button>
    </div>
  )
}));

describe("SettingsHost", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders a section-driven member directory with human and AI principals", async () => {
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
      [`${apiBaseUrl}/workspace-member-directory?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            actorType: "human",
            displayName: "产品负责人",
            id: "human:user_demo",
            joinedAt: "2026-05-29T00:00:00.000Z",
            lastActiveAt: "2026-05-29T00:00:00.000Z",
            principalKind: "human",
            role: "owner",
            roleLabel: "工作区成员",
            status: "active",
            summary: null,
            teammateId: null,
            userId: "user_demo",
            workspaceId: "default-workspace"
          },
          {
            actorType: "ai",
            displayName: "技术负责人",
            id: "ai:tech_lead",
            joinedAt: null,
            lastActiveAt: null,
            principalKind: "ai_teammate",
            role: "agent",
            roleLabel: "AI 同事 · 技术负责人",
            status: "active",
            summary: "负责需求澄清、计划拆解和风险把控。",
            teammateId: "tech_lead",
            userId: null,
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/workspace-billing-summary?workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspace-capabilities?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ]
    });

    render(<SettingsHost initialSection="members" />);

    expect(await screen.findByText("产品负责人")).toBeInTheDocument();
    expect(screen.getByText("技术负责人")).toBeInTheDocument();
    expect(screen.getAllByText("成员").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI 同事").length).toBeGreaterThan(0);
  });

  it("renders model connection settings and preserves the legacy setup note", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/workspaces`]: [jsonResponse(200, [])],
      [`${apiBaseUrl}/workspace-member-directory?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspace-billing-summary?workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspace-capabilities?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            compatibleRoles: ["技术负责人"],
            enabled: true,
            id: "planning-and-approval",
            installState: "enabled",
            name: "计划与审批",
            permissionScope: "读取需求和审批",
            riskNote: "关键节点确认",
            source: "工作区能力库",
            summary: "负责拆解计划、整理风险，并把关键节点提交给用户确认。",
            version: "1.0.0",
            workspaceId: "default-workspace"
          }
        ])
      ],
      [`${apiBaseUrl}/credentials/model-connections?workspaceId=default-workspace`]: [
        jsonResponse(200, [
          {
            id: "conn_1",
            kind: "deepseek_api",
            label: "DeepSeek 工作区连接",
            model: "deepseek-chat",
            preset: "balanced",
            status: "valid",
            workspaceId: "default-workspace"
          }
        ])
      ]
    });

    render(<SettingsHost initialSection="credentials" legacySetupMode />);

    expect(await screen.findByText("DeepSeek 工作区连接")).toBeInTheDocument();
    expect(screen.getByText(/\/setup/)).toBeInTheDocument();
    expect(screen.getAllByText("模型连接").length).toBeGreaterThan(0);
  });

  it("refreshes active workspaces after the auth panel reports login success", async () => {
    mockFetchByUrl({
      [`${apiBaseUrl}/workspaces`]: [
        jsonResponse(401, { message: "Unauthorized" }),
        jsonResponse(200, [
          {
            createdAt: "2026-05-29T00:00:00.000Z",
            id: "workspace_phase_a",
            name: "Phase A Demo Workspace",
            ownerUserId: "user_phase_a",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ])
      ],
      [`${apiBaseUrl}/workspace-member-directory?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspace-billing-summary?workspaceId=default-workspace`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspace-capabilities?workspaceId=default-workspace`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspace-member-directory?workspaceId=workspace_phase_a`]: [
        jsonResponse(200, [])
      ],
      [`${apiBaseUrl}/workspace-billing-summary?workspaceId=workspace_phase_a`]: [
        jsonResponse(200, null)
      ],
      [`${apiBaseUrl}/workspace-capabilities?workspaceId=workspace_phase_a`]: [
        jsonResponse(200, [])
      ]
    });

    render(<SettingsHost initialSection="profile" />);

    expect(await screen.findByText("Mock Auth Panel")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        countFetches(`${apiBaseUrl}/workspace-member-directory?workspaceId=default-workspace`)
      ).toBe(1);
    });
    expect(screen.getByRole("combobox", { name: "Active workspace" })).toHaveValue(
      "default-workspace"
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock login success" }));

    expect(await screen.findByText("Phase A Demo Workspace")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Active workspace" })).toHaveValue(
      "workspace_phase_a"
    );
    await waitFor(() => {
      expect(countFetches(`${apiBaseUrl}/workspaces`)).toBe(2);
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

function countFetches(url: string): number {
  return fetchMock.mock.calls.filter(([input]) => toRequestUrl(input) === url).length;
}

function toRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}
