import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

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
      previewUrl: "http://localhost:9000/agenthub-dev/release-checklist.md",
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
      previewUrl: "http://localhost:9000/agenthub-dev/release.diff",
      storageKey: "artifacts/default-workspace/msg_assistant_artifacts/release.diff",
      title: "Release diff",
      workspaceId: conversation.workspaceId
    };

    const revisionBodies: unknown[] = [];

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === attachmentArtifact.previewUrl) {
        return new Response("# Release checklist\n\n- Verify artifact preview\n- Dispatch follow-up edit", {
          headers: { "content-type": "text/markdown" },
          status: 200
        });
      }

      if (url === diffArtifact.previewUrl) {
        return new Response("diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new\n", {
          headers: { "content-type": "text/x-diff" },
          status: 200
        });
      }

      if (
        url === `/api/artifacts/${diffArtifact.id}/revisions?workspaceId=${conversation.workspaceId}` &&
        init?.method === "POST"
      ) {
        revisionBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ id: "rev_diff_1", revisionIndex: 1 }), {
          headers: { "content-type": "application/json" },
          status: 201
        });
      }

      if (url.endsWith("/workspaces")) {
        return new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.includes("/credentials/model-connections?")) {
        return new Response(JSON.stringify([{ id: "connection_valid", status: "valid" }]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.includes("/custom-agents?")) {
        return new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.includes("/conversations?")) {
        return new Response(JSON.stringify([conversation]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.includes("/messages?")) {
        return new Response(JSON.stringify([userMessage, assistantMessage]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.includes(`/coding-workflows?`)) {
        return new Response(JSON.stringify(null), {
          headers: { "content-type": "application/json" },
          status: 404
        });
      }

      if (url.includes(`/artifacts?messageId=${userMessage.id}`)) {
        return new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url.includes(`/artifacts?messageId=${assistantMessage.id}`)) {
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

    const { default: HomePage } = await import("../../apps/web/src/app/page");

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
    expect(attachmentCard).toHaveTextContent("Open Markdown");
    expect(attachmentCard).not.toHaveTextContent(
      "artifacts/default-workspace/msg_assistant_artifacts/release-checklist.md"
    );
    expect(screen.getByLabelText("Open Release checklist Markdown in a new tab")).toHaveAttribute(
      "href",
      "http://localhost:9000/agenthub-dev/release-checklist.md"
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Release checklist artifact workbench" }));

    await waitFor(() => {
      expect(screen.getByText(/Dispatch follow-up edit/)).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Release checklist artifact workbench")).toHaveAttribute(
      "data-artifact-workbench"
    );
    expect(screen.getByRole("button", { name: "Edit Release checklist through chat" })).toBeInTheDocument();

    const diffCard = await screen.findByLabelText("Diff artifact Release diff");
    expect(diffCard).toHaveAttribute("data-artifact-card", "diff");
    expect(diffCard).toHaveTextContent("Release diff");
    expect(diffCard).toHaveTextContent("Baseline diff card");

    fireEvent.click(screen.getByRole("button", { name: "应用 Diff" }));

    await waitFor(() => {
      expect(screen.getByTestId("message-actions-status")).toHaveTextContent(
        "Diff 已应用并记录为版本 #1。"
      );
    });
    expect(revisionBodies).toHaveLength(1);
    expect(revisionBodies[0]).toMatchObject({
      previewUrl: diffArtifact.previewUrl,
      storageKey: diffArtifact.storageKey,
      summary: `Applied diff from message ${assistantMessage.id}`
    });
    expect((revisionBodies[0] as { contentDigest?: string }).contentDigest).toMatch(
      /^[a-f0-9]{64}$/
    );

    const artifactGroup = await screen.findByLabelText(
      `Artifacts attached to message ${assistantMessage.id}`
    );
    expect(artifactGroup.children).toHaveLength(3);
  });


  it("sandboxes embedded HTML previews", async () => {
    const { ArtifactCard } = await import("../../apps/web/src/features/artifacts/artifact-card");

    render(
      <ArtifactCard
        artifact={{
          createdAt: new Date(),
          id: "artifact_html_preview",
          kind: "preview",
          messageId: "msg_html_preview",
          mimeType: "text/html",
          previewUrl: "https://preview.example.test/report.html",
          storageKey: "artifacts/default-workspace/msg_html_preview/report.html",
          title: "Interactive report",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Interactive report artifact workbench" }));

    const iframe = screen.getByTitle("Interactive report preview");
    expect(iframe).toHaveAttribute("sandbox", "allow-forms allow-popups allow-scripts");
    expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("caps streamed text previews in the chat timeline", async () => {
    const longMarkdown = `# Large artifact\n\n${"a".repeat(25000)}`;
    fetchMock.mockResolvedValueOnce(
      new Response(longMarkdown, {
        headers: { "content-type": "text/markdown" },
        status: 200
      })
    );

    const { ArtifactCard } = await import("../../apps/web/src/features/artifacts/artifact-card");

    render(
      <ArtifactCard
        artifact={{
          createdAt: new Date(),
          id: "artifact_large_markdown",
          kind: "attachment",
          messageId: "msg_large_markdown",
          mimeType: "text/markdown",
          previewUrl: "https://preview.example.test/large.md",
          storageKey: "artifacts/default-workspace/msg_large_markdown/large.md",
          title: "Large markdown",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Large markdown artifact workbench" }));

    const inlinePreview = await screen.findByText(/preview truncated in the timeline/);
    expect(inlinePreview).toHaveAttribute("data-artifact-inline-preview");
    expect(inlinePreview.textContent?.length).toBeLessThan(17000);
  });

});
