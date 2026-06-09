import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
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

      if (url === `/api/artifacts/${attachmentArtifact.id}/content?workspaceId=${conversation.workspaceId}`) {
        return new Response(JSON.stringify({
          artifactId: attachmentArtifact.id,
          content: "# Release checklist\n\n- Verify artifact preview\n- Dispatch follow-up edit",
          mimeType: "text/markdown",
          title: "Release checklist",
          truncated: false
        }), {
          headers: { "content-type": "application/json" },
          status: 200
        });
      }

      if (url === `/api/artifacts/${diffArtifact.id}/content?workspaceId=${conversation.workspaceId}`) {
        return new Response(JSON.stringify({
          artifactId: diffArtifact.id,
          content: "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
          mimeType: "text/x-diff",
          title: "Release diff",
          truncated: false
        }), {
          headers: { "content-type": "application/json" },
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
    expect(previewCard).not.toHaveTextContent(
      "http://localhost:9000/agenthub-dev/release-summary.png"
    );
    expect(
      within(previewCard).getByRole("link", {
        name: "Open the Release summary preview preview in a new tab"
      })
    ).toHaveAttribute(
      "href",
      "/api/artifacts/artifact_preview/file?workspaceId=default-workspace&disposition=inline"
    );

    const attachmentCard = await screen.findByLabelText(
      "Attachment artifact Release checklist"
    );
    expect(attachmentCard).toHaveAttribute("data-artifact-card", "attachment");
    expect(attachmentCard).toHaveTextContent("Release checklist");
    expect(attachmentCard).toHaveTextContent("打开 Markdown");
    expect(attachmentCard).not.toHaveTextContent(
      "artifacts/default-workspace/msg_assistant_artifacts/release-checklist.md"
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Release checklist artifact workbench" }));

    await waitFor(() => {
      expect(screen.getByText(/Dispatch follow-up edit/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/artifacts/${attachmentArtifact.id}/content?workspaceId=${conversation.workspaceId}`,
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal)
      })
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input) === attachmentArtifact.previewUrl)).toBe(false);

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
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/artifacts/${diffArtifact.id}/content?workspaceId=${conversation.workspaceId}`,
      { credentials: "include" }
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input) === diffArtifact.previewUrl)).toBe(false);

    const artifactGroup = await screen.findByLabelText(
      `Artifacts attached to message ${assistantMessage.id}`
    );
    expect(artifactGroup.children).toHaveLength(3);
  });


  it("renders storage-backed HTML previews through the artifact content endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        artifactId: "artifact_html_preview",
        content: "<!doctype html><html><body><h1>Interactive report</h1></body></html>",
        mimeType: "text/html",
        title: "Interactive report",
        truncated: false
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
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

    const iframe = await screen.findByTitle("Interactive report preview");
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Interactive report")
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_html_preview/content?workspaceId=default-workspace",
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal)
      })
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "https://preview.example.test/report.html")).toBe(false);
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
          storageKey: null,
          title: "Large markdown",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Large markdown artifact workbench" }));

    const inlinePreview = await screen.findByText(/preview truncated in the timeline/);
    expect(inlinePreview.closest("[data-artifact-inline-preview]")).not.toBeNull();
    expect(inlinePreview.textContent?.length).toBeLessThan(17000);
  });

  it("loads Markdown previews through the artifact content endpoint when only a storage key exists", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        artifactId: "artifact_storage_only_markdown",
        content: "## Phase A architecture brief\n\n| Area | Status |\n| --- | --- |\n| Preview | Ready |",
        mimeType: "text/markdown",
        title: "Phase A architecture brief",
        truncated: false
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );

    const { ArtifactCard } = await import("../../apps/web/src/features/artifacts/artifact-card");

    render(
      <ArtifactCard
        artifact={{
          createdAt: new Date(),
          id: "artifact_storage_only_markdown",
          kind: "attachment",
          messageId: "msg_markdown_storage_only",
          mimeType: "text/markdown",
          previewUrl: null,
          storageKey: "artifacts/default-workspace/msg_markdown_storage_only/brief.md",
          title: "Phase A architecture brief",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Phase A architecture brief artifact workbench" }));

    expect(
      await screen.findByRole("heading", { name: "Phase A architecture brief" })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_storage_only_markdown/content?workspaceId=default-workspace",
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal)
      })
    );
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.queryByText("No inline preview is available for this artifact yet.")).not.toBeInTheDocument();
  });

  it("prefers the artifact content endpoint over unsigned Markdown preview URLs", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        artifactId: "artifact_protected_markdown",
        content: "## Protected runbook\n\n| Area | Status |\n| --- | --- |\n| Authenticated preview | Ready |",
        mimeType: "text/markdown",
        title: "Protected runbook",
        truncated: false
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );

    const { ArtifactCard } = await import("../../apps/web/src/features/artifacts/artifact-card");

    render(
      <ArtifactCard
        artifact={{
          createdAt: new Date(),
          id: "artifact_protected_markdown",
          kind: "attachment",
          messageId: "msg_protected_markdown",
          mimeType: "text/markdown",
          previewUrl: "https://r2.example.test/unsigned/protected.md",
          storageKey: "artifacts/default-workspace/msg_protected_markdown/protected.md",
          title: "Protected runbook",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Protected runbook artifact workbench" }));

    expect(
      await screen.findByRole("heading", { name: "Protected runbook" })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_protected_markdown/content?workspaceId=default-workspace",
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal)
      })
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "https://r2.example.test/unsigned/protected.md")).toBe(false);
  });

  it("opens storage-backed Markdown artifacts through the same-origin viewer", async () => {
    const { ArtifactCard } = await import("../../apps/web/src/features/artifacts/artifact-card");

    render(
      <ArtifactCard
        artifact={{
          createdAt: new Date(),
          id: "artifact_open_markdown",
          kind: "attachment",
          messageId: "msg_open_markdown",
          mimeType: "text/markdown",
          previewUrl: "https://r2.example.test/unsigned/open.md",
          storageKey: "artifacts/default-workspace/msg_open_markdown/open.md",
          title: "Protected runbook",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
      />
    );

    const openLink = screen.getByRole("link", {
      name: "Open Protected runbook Markdown in a new tab"
    });
    expect(openLink).toHaveAttribute(
      "href",
      "/artifacts/artifact_open_markdown?workspaceId=default-workspace"
    );
    expect(openLink).toHaveAttribute("target", "_blank");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers an artifact download action through the same-origin file endpoint", async () => {
    const { ArtifactCard } = await import("../../apps/web/src/features/artifacts/artifact-card");

    render(
      <ArtifactCard
        artifact={{
          createdAt: new Date(),
          id: "artifact_download_markdown",
          kind: "attachment",
          messageId: "msg_download_markdown",
          mimeType: "text/markdown",
          previewUrl: null,
          storageKey: "artifacts/default-workspace/msg_download_markdown/brief.md",
          title: "Phase A architecture brief",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_1"
      />
    );

    const downloadLink = screen.getByRole("link", { name: "下载 Phase A architecture brief" });
    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/artifacts/artifact_download_markdown/file?workspaceId=default-workspace&disposition=attachment"
    );
    expect(downloadLink).toHaveAttribute("target", "_blank");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens storage-backed preview cards through same-origin artifact routes", async () => {
    const { PreviewCard } = await import("../../apps/web/src/features/artifacts/preview-card");

    render(
      <PreviewCard
        artifact={{
          createdAt: new Date(),
          id: "artifact_preview_card_markdown",
          kind: "preview",
          messageId: "msg_preview_card",
          mimeType: "text/markdown",
          previewUrl: "https://r2.example.test/unsigned/preview.md",
          storageKey: "artifacts/default-workspace/msg_preview_card/preview.md",
          title: "Preview card Markdown",
          workspaceId: "default-workspace"
        }}
      />
    );

    const previewLink = screen.getByRole("link", {
      name: "Open the Preview card Markdown preview in a new tab"
    });
    expect(previewLink).toHaveAttribute(
      "href",
      "/artifacts/artifact_preview_card_markdown?workspaceId=default-workspace"
    );
    expect(previewLink).toHaveTextContent("打开 Markdown");
    expect(screen.queryByText("https://r2.example.test/unsigned/preview.md")).not.toBeInTheDocument();
  });

});
