import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { ArtifactsController } from "../src/modules/artifacts/artifacts.controller.js";

describe("ArtifactsController", () => {
  it("streams stored artifact files with browser-safe same-origin headers", async () => {
    const body = Readable.from(["# 编码工作流回归测试验收总结\n"]);
    const authService = {
      requireAuthenticatedUser: vi.fn(async () => ({ id: "user_demo" }))
    };
    const artifactsService = {
      readFileContent: vi.fn(async () => ({
        body,
        contentLength: 42,
        fileName: "编码工作流回归测试验收总结.md",
        mimeType: "text/markdown"
      }))
    };
    const controller = new ArtifactsController(
      authService as never,
      artifactsService as never,
      {} as never,
      {} as never,
      {} as never
    );
    const reply = {
      header: vi.fn(() => reply),
      send: vi.fn()
    };

    await controller.readFile(
      "artifact_markdown",
      "default-workspace",
      "attachment",
      "session=demo",
      reply as never
    );

    expect(authService.requireAuthenticatedUser).toHaveBeenCalledWith("session=demo");
    expect(artifactsService.readFileContent).toHaveBeenCalledWith(
      {
        artifactId: "artifact_markdown",
        workspaceId: "default-workspace"
      },
      "user_demo"
    );
    expect(reply.header).toHaveBeenCalledWith("Content-Type", "text/markdown");
    expect(reply.header).toHaveBeenCalledWith("Content-Length", "42");
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(reply.header).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(reply.header).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("attachment;")
    );
    expect(reply.header).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("filename*=UTF-8''%E7%BC%96%E7%A0%81")
    );
    expect(reply.send).toHaveBeenCalledWith(body);
  });
});
