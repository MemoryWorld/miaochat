"use client";

import { useEffect, useState } from "react";

import type {
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole
} from "@agenthub/contracts";

const apiBaseUrl = "http://localhost:3001";

type InviteDialogProps = {
  workspaceId: string;
  onClose: () => void;
};

type IssuedInvitationResponse = {
  invitation: WorkspaceInvitation;
  token: string;
};

export function InviteDialog({ workspaceId, onClose }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pending, setPending] = useState<WorkspaceInvitation[]>([]);
  const [latestToken, setLatestToken] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    void refresh();
  }, [workspaceId]);

  async function refresh(): Promise<void> {
    setError(null);
    try {
      const [memberResponse, invitationResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/members`, {
          credentials: "include"
        }),
        fetch(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/invitations`, {
          credentials: "include"
        })
      ]);

      if (memberResponse.ok) {
        setMembers((await memberResponse.json()) as WorkspaceMember[]);
      }
      if (invitationResponse.ok) {
        setPending(
          ((await invitationResponse.json()) as WorkspaceInvitation[]).filter(
            (entry) => entry.status === "pending"
          )
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load workspace data.");
    }
  }

  async function handleInvite(): Promise<void> {
    if (email.trim().length === 0) {
      setError("Email is required.");
      return;
    }

    setIsInviting(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
        {
          body: JSON.stringify({ invitedEmail: email.trim(), role }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST"
        }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(payload.message ?? `Invitation failed (${response.status})`);
      }

      const issued = (await response.json()) as IssuedInvitationResponse;
      setLatestToken(issued.token);
      setEmail("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send invitation.");
    } finally {
      setIsInviting(false);
    }
  }

  return (
    <div role="dialog" aria-label="Invite member" data-workspace-id={workspaceId}>
      <h2>Invite to workspace {workspaceId}</h2>

      <label>
        Email
        <input
          aria-label="Invited email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label>
        Role
        <select
          aria-label="Invited role"
          value={role}
          onChange={(event) => setRole(event.target.value as WorkspaceRole)}
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
      </label>

      <button type="button" onClick={() => void handleInvite()} disabled={isInviting}>
        {isInviting ? "Sending invite..." : "Send invitation"}
      </button>
      <button type="button" onClick={onClose}>
        Close
      </button>

      {error ? <p role="alert">{error}</p> : null}

      {latestToken ? (
        <p data-testid="latest-token">
          Share this token with the invitee: <code>{latestToken}</code>
        </p>
      ) : null}

      <section aria-label="Pending invitations">
        <h3>Pending invitations</h3>
        {pending.length === 0 ? (
          <p>No pending invitations.</p>
        ) : (
          <ul>
            {pending.map((invitation) => (
              <li key={invitation.id} data-invitation-id={invitation.id}>
                {invitation.invitedEmail} ({invitation.role})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Workspace members">
        <h3>Members</h3>
        <ul>
          {members.map((member) => (
            <li key={member.userId} data-member-id={member.userId}>
              {member.userId} — {member.role}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
