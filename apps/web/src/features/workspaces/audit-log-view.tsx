"use client";

import { useEffect, useState } from "react";

const apiBaseUrl = "http://localhost:3001";

type AuditEvent = {
  action: string;
  actorUserId: string;
  createdAt: string;
  details: Record<string, unknown>;
  eventHash: string;
  id: string;
  previousHash: string | null;
  resourceId: string | null;
  resourceType: string;
  workspaceId: string;
};

type AuditPage = {
  events: AuditEvent[];
  nextCursor: string | null;
};

type AuditLogViewProps = {
  workspaceId: string;
};

export function AuditLogView({ workspaceId }: AuditLogViewProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEvents([]);
    setCursor(null);
    void loadPage(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function loadPage(
    pageCursor: string | null,
    append: boolean
  ): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (pageCursor) {
        params.set("cursor", pageCursor);
      }
      const response = await fetch(
        `${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/audit${params.size ? `?${params.toString()}` : ""}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? `Failed to load audit log (${response.status}).`);
      }

      const payload = (await response.json()) as AuditPage;
      setEvents((current) => (append ? [...current, ...payload.events] : payload.events));
      setCursor(payload.nextCursor);
      setHasMore(payload.nextCursor !== null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load audit log.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section data-testid="audit-log-view" aria-label="Workspace audit log">
      <h2>Audit log — {workspaceId}</h2>
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Actor</th>
            <th scope="col">Action</th>
            <th scope="col">Resource</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} data-event-id={event.id} data-action={event.action}>
              <td>{new Date(event.createdAt).toISOString()}</td>
              <td>{event.actorUserId}</td>
              <td>{event.action}</td>
              <td>
                {event.resourceType}
                {event.resourceId ? ` (${event.resourceId})` : ""}
              </td>
            </tr>
          ))}
          {events.length === 0 && !isLoading ? (
            <tr>
              <td colSpan={4}>No audit events yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {hasMore ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void loadPage(cursor, true)}
        >
          {isLoading ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
