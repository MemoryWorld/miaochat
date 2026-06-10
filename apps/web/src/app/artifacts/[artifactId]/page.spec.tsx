// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<typeof fetch>();

describe("ArtifactViewerPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("renders a Markdown artifact through the authenticated content API", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        artifactId: "artifact_view_markdown",
        content: "# 编码工作流回归测试验收总结\n\n| 项目 | 结果 |\n| --- | --- |\n| 原始想法完成度 | 85% |\n\n```ts\nconst visible = true;\n```",
        mimeType: "text/markdown",
        title: "编码工作流回归测试验收总结",
        truncated: false
      }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
    const { default: ArtifactViewerPage } = await import("./page");

    render(
      await ArtifactViewerPage({
        params: Promise.resolve({ artifactId: "artifact_view_markdown" }),
        searchParams: Promise.resolve({ workspaceId: "default-workspace" })
      })
    );

    expect(
      (await screen.findAllByRole("heading", { name: "编码工作流回归测试验收总结" })).length
    ).toBeGreaterThan(0);
    expect(screen.getByText("原始想法完成度")).toBeInTheDocument();
    expect(screen.getByText("const visible = true;")).toHaveStyle({
      background: "transparent",
      color: "inherit"
    });
    expect(screen.getByRole("link", { name: "下载 Markdown" })).toHaveAttribute(
      "href",
      "/api/artifacts/artifact_view_markdown/file?workspaceId=default-workspace&disposition=attachment"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/artifacts/artifact_view_markdown/content?workspaceId=default-workspace",
      expect.objectContaining({
        credentials: "include",
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("shows an error state when the artifact cannot be loaded", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Artifact not found" }), {
        headers: { "content-type": "application/json" },
        status: 404
      })
    );
    const { default: ArtifactViewerPage } = await import("./page");

    render(
      await ArtifactViewerPage({
        params: Promise.resolve({ artifactId: "missing_artifact" }),
        searchParams: Promise.resolve({ workspaceId: "default-workspace" })
      })
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Markdown 产物加载失败（404）。");
    });
  });
});
