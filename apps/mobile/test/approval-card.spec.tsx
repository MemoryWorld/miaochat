import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApprovalCard } from "../src/components/approval-card";
import { ConversationListScreen } from "../src/screens/conversation-list";
import { ConversationThreadScreen } from "../src/screens/conversation-thread";

describe("mobile shell", () => {
  it("renders a compact conversation list for browsing", () => {
    render(
      <ConversationListScreen
        conversations={[
          {
            id: "conv_mobile_1",
            subtitle: "Waiting for approval",
            title: "Release Ops"
          },
          {
            id: "conv_mobile_2",
            subtitle: "2 attachments",
            title: "Design Review"
          }
        ]}
      />
    );

    expect(screen.getByText("Release Ops")).toBeInTheDocument();
    expect(screen.getByText("Design Review")).toBeInTheDocument();
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
  });

  it("surfaces approve and reject actions through the approval card callbacks", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(
      <ApprovalCard
        description="Publish the preview deployment to the workspace."
        onApprove={onApprove}
        onReject={onReject}
        title="Deploy approval"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("renders approval cards and attachment previews inside the thread screen", () => {
    render(
      <ConversationThreadScreen
        approvalRequests={[
          {
            description: "Ship the latest marketing site preview.",
            id: "approval_mobile_1",
            title: "Marketing deploy"
          }
        ]}
        attachments={[
          {
            id: "artifact_mobile_1",
            kind: "image",
            previewUrl: "https://files.example/preview.png",
            title: "Preview screenshot"
          },
          {
            id: "artifact_mobile_2",
            kind: "attachment",
            previewUrl: "https://files.example/release-notes.md",
            title: "Release notes"
          }
        ]}
        messages={[
          {
            id: "message_mobile_1",
            role: "assistant",
            text: "Review the preview and approve if it looks good."
          }
        ]}
        onApprove={() => undefined}
        onReject={() => undefined}
      />
    );

    expect(screen.getByText("Marketing deploy")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Preview attachment Preview screenshot" })
    ).toHaveAttribute("src", "https://files.example/preview.png");
    expect(
      screen.getByRole("link", { name: "Open attachment Release notes" })
    ).toHaveAttribute("href", "https://files.example/release-notes.md");
  });
});
