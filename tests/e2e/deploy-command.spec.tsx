import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "../../apps/web/src/app/page";

const fetchMock = vi.fn<typeof fetch>();

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly close = vi.fn();
  readonly url: string;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

describe("deploy command", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("dispatches /deploy to the deploy endpoint and renders a deploy status card", async () => {
    const workspace = {
      createdAt: "2026-05-22T00:00:00.000Z",
      id: "workspace_deploy",
      name: "Deploy Workspace",
      ownerUserId: "user_owner",
      updatedAt: "2026-05-22T00:00:00.000Z"
    };
    const conversation = {
      id: "conv_deploy",
      mode: "direct",
      ownerUserId: "user_owner",
      participants: [{ agentId: "agent_deployer", agentName: "Deploy Agent" }],
      pinnedMessageIds: [],
      title: "Deploy conversation",
      updatedAt: "2026-05-22T01:00:00.000Z",
      workspaceId: workspace.id
    };
    const assistantMessage = {
      content: "The build artifact is ready.",
      conversationId: conversation.id,
      createdAt: "2026-05-22T01:02:00.000Z",
      id: "msg_assistant_deploy",
      isPinned: false,
      mentionedAgentIds: [],
      role: "assistant",
      sourceAgentId: "agent_deployer",
      workspaceId: workspace.id
    };
    const artifact = {
      createdAt: "2026-05-22T01:02:05.000Z",
      id: "artifact_deploy_bundle",
      kind: "attachment",
      messageId: assistantMessage.id,
      mimeType: "application/zip",
      previewUrl: null,
      storageKey: "artifacts/workspace_deploy/msg_assistant_deploy/site.zip",
      title: "Marketing Site Bundle",
      workspaceId: workspace.id
    };
    const deployResponse = {
      artifact,
      deployment: {
        artifactId: artifact.id,
        completedAt: "2026-05-22T01:03:00.000Z",
        createdAt: "2026-05-22T01:02:30.000Z",
        deployTargetId: "target_marketing_preview",
        errorMessage: null,
        id: "deployment_marketing_preview",
        ownerUserId: "user_owner",
        previewUrl: "https://preview.workspace.example/marketing-site",
        progressEvents: [
          {
            at: "2026-05-22T01:02:30.000Z",
            label: "deployment.received",
            message: "Deployment request accepted.",
            metadata: {},
            status: "queued"
          },
          {
            at: "2026-05-22T01:02:35.000Z",
            label: "deployment.running",
            message: "Deployment execution started.",
            metadata: {},
            status: "running"
          },
          {
            at: "2026-05-22T01:03:00.000Z",
            label: "deployment.completed",
            message: "Static site deployed to preview.",
            metadata: {},
            status: "succeeded"
          }
        ],
        resultMessage: "Static site deployed to preview.",
        startedAt: "2026-05-22T01:02:30.000Z",
        status: "succeeded",
        targetKind: "static-site",
        updatedAt: "2026-05-22T01:03:00.000Z",
        workspaceId: workspace.id
      },
      target: {
        credentialSource: "user_provided",
        hasSecret: true,
        id: "target_marketing_preview",
        kind: "static-site",
        name: "Marketing Preview",
        workspaceId: workspace.id
      }
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "http://localhost:3001/workspaces") {
        return jsonResponse([workspace], 200);
      }

      if (url === "http://localhost:3001/conversations?workspaceId=default-workspace") {
        return jsonResponse([], 200);
      }

      if (url === `http://localhost:3001/conversations?workspaceId=${workspace.id}`) {
        return jsonResponse([conversation], 200);
      }

      if (
        url ===
        `http://localhost:3001/messages?conversationId=${conversation.id}&workspaceId=${workspace.id}`
      ) {
        return jsonResponse([assistantMessage], 200);
      }

      if (
        url ===
        `http://localhost:3001/artifacts?messageId=${assistantMessage.id}&workspaceId=${workspace.id}`
      ) {
        return jsonResponse([artifact], 200);
      }

      if (url === "http://localhost:3001/deploys" && init?.method === "POST") {
        return jsonResponse(deployResponse, 201);
      }

      if (url === "http://localhost:3001/messages/send") {
        throw new Error("Regular message dispatch should not be used for /deploy.");
      }

      throw new Error(`Unexpected fetch in deploy-command e2e test: ${url}`);
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getAllByText("Deploy conversation").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("Message"), {
      target: {
        value: "/deploy Marketing Preview"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:3001/deploys",
        expect.objectContaining({
          body: JSON.stringify({
            conversationId: conversation.id,
            targetName: "Marketing Preview",
            workspaceId: workspace.id
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      );
    });

    const deployCard = await screen.findByLabelText(
      "Deploy status card for Marketing Site Bundle"
    );
    expect(deployCard).toHaveAttribute("data-deploy-status", "succeeded");
    expect(deployCard).toHaveTextContent("Marketing Preview");
    expect(deployCard).toHaveTextContent("Marketing Site Bundle");
    expect(deployCard).toHaveTextContent("Static site deployed to preview.");
    expect(deployCard).toHaveTextContent(
      "https://preview.workspace.example/marketing-site"
    );
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
