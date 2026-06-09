import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MessageFileView } from "../../apps/web/src/features/chat/message-file-view";
import { MessageImageView } from "../../apps/web/src/features/chat/message-image-view";

describe("inline attachments", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an image inline when scan is clean and falls back to download otherwise", () => {
    const baseArtifact = {
      createdAt: new Date(),
      id: "art_image",
      kind: "image" as const,
      messageId: "msg_1",
      mimeType: "image/png",
      previewUrl: "https://files.example/preview.png",
      storageKey: "key",
      title: "Diagram",
      workspaceId: "default-workspace"
    };

    const { rerender } = render(<MessageImageView artifact={baseArtifact} scanStatus="clean" />);
    expect(screen.getByRole("img", { name: "Diagram" })).toHaveAttribute(
      "src",
      "/api/artifacts/art_image/file?workspaceId=default-workspace&disposition=inline"
    );

    rerender(<MessageImageView artifact={baseArtifact} scanStatus="pending" />);
    expect(screen.getByRole("link", { name: "Download Diagram" })).toHaveAttribute(
      "href",
      "/api/artifacts/art_image/file?workspaceId=default-workspace&disposition=attachment"
    );

    rerender(<MessageImageView artifact={baseArtifact} scanStatus="rejected" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/blocked/i);
  });

  it("renders a file with View inline only for safe text mime types", () => {
    const baseArtifact = {
      createdAt: new Date(),
      id: "art_file",
      kind: "attachment" as const,
      messageId: "msg_1",
      mimeType: "text/markdown",
      previewUrl: "https://files.example/notes.md",
      storageKey: "key",
      title: "Notes.md",
      workspaceId: "default-workspace"
    };

    render(<MessageFileView artifact={baseArtifact} scanStatus="clean" />);
    expect(screen.getByRole("link", { name: "View inline" })).toHaveAttribute(
      "href",
      "/artifacts/art_file?workspaceId=default-workspace"
    );

    cleanup();
    render(
      <MessageFileView
        artifact={{ ...baseArtifact, mimeType: "application/octet-stream" }}
        scanStatus="clean"
      />
    );
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/artifacts/art_file/file?workspaceId=default-workspace&disposition=attachment"
    );
  });
});
