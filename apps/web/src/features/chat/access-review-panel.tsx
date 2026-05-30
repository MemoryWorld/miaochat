"use client";

import { useEffect, useState } from "react";

import { apiBaseUrl } from "../../lib/api-base-url";

type AuditEvent = {
  action: string;
  actorUserId: string;
  createdAt: string;
  details: Record<string, unknown>;
  id: string;
  resourceId: string | null;
  resourceType: string;
};

type AccessReviewPanelProps = {
  conversationId: string;
};

export function AccessReviewPanel({ conversationId }: AccessReviewPanelProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const response = await fetch(
          `${apiBaseUrl}/conversations/${encodeURIComponent(conversationId)}/access-review`,
          { credentials: "include" }
        );
        if (!response.ok) {
          throw new Error(`加载访问审计失败（${response.status}）。`);
        }
        if (!cancelled) {
          setEvents((await response.json()) as AuditEvent[]);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "加载失败。");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <section data-testid="access-review-panel" aria-label="Access review">
      <h2>Access review — {conversationId}</h2>
      {error ? <p role="alert">{error}</p> : null}
      {events.length === 0 && !error ? <p>No access events recorded yet.</p> : null}
      <ul>
        {events.map((event) => (
          <li key={event.id} data-action={event.action}>
            <time dateTime={event.createdAt}>{event.createdAt}</time>
            {" — "}
            <strong>{event.action}</strong>
            {" by "}
            <code>{event.actorUserId}</code>
            {event.resourceId ? <> on <code>{event.resourceId}</code></> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
