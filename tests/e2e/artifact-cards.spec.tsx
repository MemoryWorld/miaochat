import "@testing-library/jest-dom/vitest";

import {
  cleanup,
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

  emitOpen() {
    this.onopen?.(new Event("open"));
  }
}

describe("artifact cards rendering", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders preview, attachment, and baseline diff artifact cards within the chat timeline", async () => {
    const conversation = {
      id: "conv_artifacts_ui",
      mode: "direct",
      ownerUserId: "system-user",
      participants: [{ agentId: "agent_artifact_operator", agentName: "Artifact Operator" }],
      pinnedMessageIds: [],
      title: "Artifact Operator session",
      updatedAt: new Date("2026-05-21T11:00:00.000Z").toISOString(),
      workspaceId: "default-workspace"
    };
    const userMessage = {
      content: "Generate the release artifacts",
      conversationId: conversation.id,
      createdAt: new Date("2026-05-21T11:01:00.000Z").toISOString(),
      id: "msg_user_artifacts",
      isPinned: false,
      mentionedAgentIds: [],
      role: "user",
      sourceAgentId: null,
      workspaceId: conversation.workspaceId
    };
    const assistantMessage = {
      content: "Here is the release bundle with three artifacts.",
      conversationId: conversation.id,
      createdAt: new Date("2026-05-21T11:01:30.000Z").toISOString(),
      id: "msg_assistant_artifacts",
      isPinned: false,
      mentionedAgentIds: [],
      role: "assistant",
      sourceAgentId: "agent_artifact_operator",
      workspaceId: conversation.workspaceId
    };
    const previewArtifact = {
      createdAt: new Date("2026-05-21T11:01:45.000Z").toISOString(),
      id: "artifact_preview",
      kind: "preview",
      messageId: assistantMessage.id,
      mimeType: "image/png",
      previewUrl: "http://localhost:9000/agenthub-dev/release-summary.png",
      storageKey: "artifacts/default-workspace/msg_assistant_artifacts/preview-summary.png",
      title: "Release summary preview",
      workspaceId: conversation.workspaceId
    };
    const attachmentArtifact = {
      createdAt: new Date("2026-05-21T11:01:50.000Z").toISOString(),
      id: "artifact_attachment",
      kind: "attachment",
      messageId: assistantMessage.id,
      mimeType: "text/markdown",
      previewUrl: null,
      storageKey: "artifacts/default-workspace/msg_assistant_artifacts/release-checklist.md",
      title: "Release checklist",
      workspaceId: conversation.workspaceId
    };
    const diffArtifact = {
      createdAt: new Date("2026-05-21T11:01:55.000Z").toISOString(),
      id: "artifact_diff",
      kind: "diff",
      messageId: assistantMessage.id,
      mimeType: "text/x-diff",
      previewUrl: null,
      storageKey: "artifacts/default-workspace/msg_assistant_artifacts/release.diff",
      title: "Release diff",
      workspaceId: conversation.workspaceId
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "http://localhost:3001/workspaces") {
        return new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.startsWith("http://localhost:3001/conversations?")) {
        return new Response(JSON.stringify([conversation]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.startsWith("http://localhost:3001/messages?")) {
        return new Response(JSON.stringify([userMessage, assistantMessage]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.startsWith(`http://localhost:3001/artifacts?messageId=${userMessage.id}`)) {
        return new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.startsWith(`http://localhost:3001/artifacts?messageId=${assistantMessage.id}`)) {
        return new Response(
          JSON.stringify([previewArtifact, attachmentArtifact, diffArtifact]),
          {
            headers: { "content-type": "application/json" },
            status: 200
          }
        );
      }

      throw new Error(`Unexpected fetch in artifact-card e2e test: ${url}`);
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getAllByText("Release diff").length).toBeGreaterThan(0);
    });

    const previewCard = await screen.findByLabelText(
      "Preview artifact Release summary preview"
    );
    expect(previewCard).toHaveAttribute("data-artifact-card", "preview");
    expect(previewCard).toHaveAttribute("data-artifact-kind", "preview");
    expect(previewCard).toHaveTextContent("Release summary preview");
    expect(previewCard).toHaveTextContent(
      "http://localhost:9000/agenthub-dev/release-summary.png"
    );

    const attachmentCard = await screen.findByLabelText(
      "Attachment artifact Release checklist"
    );
    expect(attachmentCard).toHaveAttribute("data-artifact-card", "attachment");
    expect(attachmentCard).toHaveTextContent("Release checklist");
    expect(attachmentCard).toHaveTextContent(
      "artifacts/default-workspace/msg_assistant_artifacts/release-checklist.md"
    );

    const diffCard = await screen.findByLabelText("Diff artifact Release diff");
    expect(diffCard).toHaveAttribute("data-artifact-card", "diff");
    expect(diffCard).toHaveTextContent("Release diff");
    expect(diffCard).toHaveTextContent("Baseline diff card");

    const artifactGroup = await screen.findByLabelText(
      `Artifacts attached to message ${assistantMessage.id}`
    );
    expect(artifactGroup.children).toHaveLength(3);
  });
});
