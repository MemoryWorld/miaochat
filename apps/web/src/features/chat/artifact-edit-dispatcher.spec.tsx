// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactEditDispatcher } from "./artifact-edit-dispatcher";

const fetchMock = vi.fn<typeof fetch>();

const artifact = {
  createdAt: new Date("2026-06-11T00:00:00.000Z"),
  id: "artifact_md",
  kind: "preview" as const,
  messageId: "msg_md",
  mimeType: "text/markdown",
  previewUrl: null,
  storageKey: "artifacts/default-workspace/msg_md/notes.md",
  title: "发布说明",
  workspaceId: "default-workspace"
};

const initialContent = "# 标题\n第一段内容\n第二段内容\n尾部";

describe("ArtifactEditDispatcher selection edit", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function selectLinesTwoToThree() {
    const editor = screen.getByLabelText("Code editor content");

    fireEvent.select(editor, {
      target: { selectionEnd: 16, selectionStart: 5 }
    });
  }

  it("dispatches a selection edit request with the artifact attached", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: { id: "msg_new" } }), { status: 200 })
    );
    const onClose = vi.fn();

    render(
      <ArtifactEditDispatcher
        artifact={artifact}
        conversationId="conv_edit"
        initialContent={initialContent}
        onClose={onClose}
      />
    );

    expect(
      screen.getByText("在上方代码中选中片段，可直接描述修改交给 AI 同事处理。")
    ).toBeInTheDocument();

    selectLinesTwoToThree();

    expect(screen.getByText(/已选中第 2–3 行/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("描述要对选中片段做的修改"), {
      target: { value: "改成更正式的措辞" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送修改请求" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/messages/send");
    const body = JSON.parse(String(init?.body));
    expect(body.conversationId).toBe("conv_edit");
    expect(body.content).toContain("请修改产物「发布说明」的选中片段（第 2–3 行）");
    expect(body.content).toContain("第一段内容\n第二段内容");
    expect(body.content).toContain("修改要求：改成更正式的措辞");
    expect(body.attachments).toEqual([
      {
        content: initialContent,
        fileName: "发布说明.md",
        mimeType: "text/markdown"
      }
    ]);
  });

  it("shows an error and keeps the overlay open when dispatch fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const onClose = vi.fn();

    render(
      <ArtifactEditDispatcher
        artifact={artifact}
        conversationId="conv_edit"
        initialContent={initialContent}
        onClose={onClose}
      />
    );

    selectLinesTwoToThree();
    fireEvent.change(screen.getByLabelText("描述要对选中片段做的修改"), {
      target: { value: "改成更正式的措辞" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送修改请求" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("发送修改请求失败（500）。");
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("requires an instruction before the request can be sent", () => {
    render(
      <ArtifactEditDispatcher
        artifact={artifact}
        conversationId="conv_edit"
        initialContent={initialContent}
        onClose={vi.fn()}
      />
    );

    selectLinesTwoToThree();

    expect(screen.getByRole("button", { name: "发送修改请求" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
