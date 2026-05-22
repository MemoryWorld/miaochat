import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiffCard } from "../../apps/web/src/features/artifacts/diff-card";
import { DiffConflictResolver } from "../../apps/web/src/features/artifacts/diff-conflict-resolver";

describe("rich diff card", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders per-hunk apply / reject controls and reports the decision", () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    render(
      <DiffCard
        artifact={{
          createdAt: new Date(),
          id: "art_diff",
          kind: "diff",
          messageId: "msg",
          mimeType: "text/plain",
          previewUrl: null,
          storageKey: null,
          title: "Sample diff",
          workspaceId: "default-workspace"
        }}
        hunks={[
          { after: "hello = 2", before: "hello = 1", id: "hunk-a" }
        ]}
        onApplyHunk={onApply}
        onRejectHunk={onReject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith("hunk-a");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledWith("hunk-a");
  });

  it("offers a conflict resolver that selects between concurrent edits", () => {
    const onResolve = vi.fn();
    render(
      <DiffConflictResolver
        branches={[
          {
            authorUserId: "user_alice",
            contentDigest: "a".repeat(64),
            label: "Alice's edit",
            preview: "alice"
          },
          {
            authorUserId: "user_bob",
            contentDigest: "b".repeat(64),
            label: "Bob's edit",
            preview: "bob"
          }
        ]}
        onResolve={onResolve}
      />
    );

    fireEvent.click(screen.getByLabelText("Select branch Bob's edit"));
    fireEvent.click(screen.getByRole("button", { name: "Apply selected branch" }));
    expect(onResolve).toHaveBeenCalledWith("b".repeat(64));
  });
});
