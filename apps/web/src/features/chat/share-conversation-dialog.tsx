"use client";

import { useEffect, useState } from "react";

const apiBaseUrl = "http://localhost:3001";

type ShareEntry = {
  conversationId: string;
  createdAt: string;
  permission: "read" | "comment";
  sharedWithUserId: string;
};

type ShareConversationDialogProps = {
  conversationId: string;
  onClose: () => void;
};

export function ShareConversationDialog({
  conversationId,
  onClose
}: ShareConversationDialogProps) {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [userIdsRaw, setUserIdsRaw] = useState("");
  const [permission, setPermission] = useState<"read" | "comment">("read");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function refresh(): Promise<void> {
    try {
      const response = await fetch(
        `${apiBaseUrl}/conversations/${encodeURIComponent(conversationId)}/shares`,
        { credentials: "include" }
      );
      if (response.ok) {
        setShares((await response.json()) as ShareEntry[]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load shares.");
    }
  }

  async function handleShare(): Promise<void> {
    const userIds = userIdsRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (userIds.length === 0) {
      setError("Provide at least one user id.");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/conversations/${encodeURIComponent(conversationId)}/shares`,
        {
          body: JSON.stringify({ permission, userIds }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST"
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(payload.message ?? `Share failed (${response.status}).`);
      }
      setUserIdsRaw("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to share.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div role="dialog" aria-label="Share conversation" data-conversation-id={conversationId}>
      <h2>Share conversation</h2>
      <label>
        User IDs (comma-separated)
        <input
          aria-label="Share user ids"
          type="text"
          value={userIdsRaw}
          onChange={(event) => setUserIdsRaw(event.target.value)}
        />
      </label>
      <label>
        Permission
        <select
          aria-label="Share permission"
          value={permission}
          onChange={(event) => setPermission(event.target.value as "read" | "comment")}
        >
          <option value="read">read</option>
          <option value="comment">comment</option>
        </select>
      </label>
      <button type="button" disabled={isBusy} onClick={() => void handleShare()}>
        {isBusy ? "Sharing..." : "Share"}
      </button>
      <button type="button" onClick={onClose}>
        Close
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <ul aria-label="Existing shares">
        {shares.map((share) => (
          <li key={share.sharedWithUserId} data-share-user-id={share.sharedWithUserId}>
            {share.sharedWithUserId} — {share.permission}
          </li>
        ))}
      </ul>
    </div>
  );
}
