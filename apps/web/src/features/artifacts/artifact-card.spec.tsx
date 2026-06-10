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

import { ArtifactCard } from "./artifact-card";

const fetchMock = vi.fn<typeof fetch>();

describe("ArtifactCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders Diff artifact previews with line-level markup", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        artifactId: "artifact_diff",
        content: "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
        mimeType: "text/x-diff",
        title: "Review diff",
        truncated: false
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      })
    );

    const { container } = render(
      <ArtifactCard
        artifact={{
          createdAt: new Date("2026-06-10T00:00:00.000Z"),
          id: "artifact_diff",
          kind: "diff",
          messageId: "msg_diff",
          mimeType: "text/x-diff",
          previewUrl: null,
          storageKey: "artifacts/default-workspace/msg_diff/review.diff",
          title: "Review diff",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_diff"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Review diff artifact workbench" }));

    await waitFor(() => {
      expect(container.querySelector("[data-unified-diff]")).toBeInTheDocument();
    });
    expect(container.querySelector('[data-diff-line-kind="removed"]')).toHaveTextContent("-old");
    expect(container.querySelector('[data-diff-line-kind="added"]')).toHaveTextContent("+new");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_diff/content?workspaceId=default-workspace",
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("renders PPTX artifacts as download cards with a PPT badge", () => {
    render(
      <ArtifactCard
        artifact={{
          createdAt: new Date("2026-06-10T00:00:00.000Z"),
          id: "artifact_pptx",
          kind: "attachment",
          messageId: "msg_pptx",
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          previewUrl: null,
          storageKey: "artifacts/default-workspace/msg_pptx/intro.pptx",
          title: "产品介绍",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_pptx"
      />
    );

    expect(screen.getByText("PPT 文稿")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载 产品介绍 PPT 文稿" })).toHaveAttribute(
      "href",
      "/api/artifacts/artifact_pptx/file?workspaceId=default-workspace&disposition=attachment"
    );
    expect(screen.getByRole("link", { name: "下载 产品介绍" })).toHaveAttribute(
      "href",
      "/api/artifacts/artifact_pptx/file?workspaceId=default-workspace&disposition=attachment"
    );
    expect(
      screen.queryByRole("button", { name: "Edit 产品介绍 through chat" })
    ).not.toBeInTheDocument();
  });

  it("loads artifact revisions, renders revision diffs, and restores a revision", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify([
          {
            artifactId: "artifact_html",
            authorUserId: "user_1",
            contentDigest: "a".repeat(64),
            createdAt: "2026-06-10T00:00:00.000Z",
            id: "revision_0",
            parentRevisionId: null,
            previewUrl: null,
            revisionIndex: 0,
            storageKey: "artifacts/default-workspace/msg_html/page-v1.html",
            summary: "Initial webpage artifact.",
            workspaceId: "default-workspace"
          },
          {
            artifactId: "artifact_html",
            authorUserId: "user_1",
            contentDigest: "b".repeat(64),
            createdAt: "2026-06-10T00:01:00.000Z",
            id: "revision_1",
            parentRevisionId: "revision_0",
            previewUrl: null,
            revisionIndex: 1,
            storageKey: "artifacts/default-workspace/msg_html/page-v2.html",
            summary: "Edited through chat.",
            workspaceId: "default-workspace"
          }
        ]), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          after: {
            artifactId: "artifact_html",
            authorUserId: "user_1",
            contentDigest: "b".repeat(64),
            createdAt: "2026-06-10T00:01:00.000Z",
            id: "revision_1",
            parentRevisionId: "revision_0",
            previewUrl: null,
            revisionIndex: 1,
            storageKey: "artifacts/default-workspace/msg_html/page-v2.html",
            summary: "Edited through chat.",
            workspaceId: "default-workspace"
          },
          before: {
            artifactId: "artifact_html",
            authorUserId: "user_1",
            contentDigest: "a".repeat(64),
            createdAt: "2026-06-10T00:00:00.000Z",
            id: "revision_0",
            parentRevisionId: null,
            previewUrl: null,
            revisionIndex: 0,
            storageKey: "artifacts/default-workspace/msg_html/page-v1.html",
            summary: "Initial webpage artifact.",
            workspaceId: "default-workspace"
          },
          patch: "--- revision-0\n+++ revision-1\n@@\n-old\n+new",
          truncated: false
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({
        artifactId: "artifact_html",
        authorUserId: "user_1",
        contentDigest: "a".repeat(64),
        createdAt: "2026-06-10T00:02:00.000Z",
        id: "revision_2",
        parentRevisionId: "revision_1",
        previewUrl: null,
        revisionIndex: 2,
        storageKey: "artifacts/default-workspace/msg_html/page-v1.html",
        summary: "Restore revision 0.",
        workspaceId: "default-workspace"
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([
          {
            artifactId: "artifact_html",
            authorUserId: "user_1",
            contentDigest: "a".repeat(64),
            createdAt: "2026-06-10T00:00:00.000Z",
            id: "revision_0",
            parentRevisionId: null,
            previewUrl: null,
            revisionIndex: 0,
            storageKey: "artifacts/default-workspace/msg_html/page-v1.html",
            summary: "Initial webpage artifact.",
            workspaceId: "default-workspace"
          }
        ]), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      );

    const { container } = render(
      <ArtifactCard
        artifact={{
          createdAt: new Date("2026-06-10T00:00:00.000Z"),
          id: "artifact_html",
          kind: "preview",
          messageId: "msg_html",
          mimeType: "text/html",
          previewUrl: null,
          storageKey: "artifacts/default-workspace/msg_html/page.html",
          title: "Date calculator",
          workspaceId: "default-workspace"
        }}
        conversationId="conv_html"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Date calculator version history" }));

    await screen.findByText("版本 #0");
    fireEvent.click(screen.getAllByRole("button", { name: "查看 Diff" })[1]!);

    await waitFor(() => {
      expect(container.querySelector("[data-artifact-revision-diff]")).toBeInTheDocument();
    });
    expect(container.querySelector('[data-diff-line-kind="removed"]')).toHaveTextContent("-old");
    expect(container.querySelector('[data-diff-line-kind="added"]')).toHaveTextContent("+new");

    fireEvent.click(screen.getAllByRole("button", { name: "回退" })[0]!);

    await screen.findByText("已回退到版本 #0，并记录为新版本。");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_html/revisions?workspaceId=default-workspace",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_html/revisions/1/diff?workspaceId=default-workspace",
      { credentials: "include" }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_html/revisions/0/restore?workspaceId=default-workspace",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
  });
});
