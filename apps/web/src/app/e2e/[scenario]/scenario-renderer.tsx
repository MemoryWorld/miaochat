"use client";

import { useState } from "react";

import type { Artifact } from "@agenthub/contracts";

import { HeavyAgentForm } from "../../../features/agents/heavy-agent-form";
import { DiffCard } from "../../../features/artifacts/diff-card";
import { DiffConflictResolver } from "../../../features/artifacts/diff-conflict-resolver";
import { AccessReviewPanel } from "../../../features/chat/access-review-panel";
import { ArtifactEditDispatcher } from "../../../features/chat/artifact-edit-dispatcher";
import { ConversationList } from "../../../features/chat/conversation-list";
import { MessageActionsMenu } from "../../../features/chat/message-actions-menu";
import { MessageFileView } from "../../../features/chat/message-file-view";
import { MessageImageView } from "../../../features/chat/message-image-view";
import { ShareConversationDialog } from "../../../features/chat/share-conversation-dialog";
import { AuditLogView } from "../../../features/workspaces/audit-log-view";
import { InviteDialog } from "../../../features/workspaces/invite-dialog";

type ScenarioRendererProps = {
  scenario: string;
};

const baseArtifact: Artifact = {
  createdAt: new Date("2026-05-22T00:00:00.000Z"),
  id: "art_fixture",
  kind: "attachment",
  messageId: "msg_fixture",
  mimeType: "text/plain",
  previewUrl: "https://files.example/fixture.txt",
  storageKey: "artifacts/default-workspace/msg_fixture/fixture.txt",
  title: "Fixture artifact",
  workspaceId: "default-workspace"
};

export function E2eScenarioRenderer({ scenario }: ScenarioRendererProps) {
  switch (scenario) {
    case "artifact-edit":
      return <ArtifactEditScenario />;
    case "conversation-list":
      return <ConversationListScenario />;
    case "diff-cards":
      return <DiffCardsScenario />;
    case "heavy-agent":
      return <HeavyAgentScenario />;
    case "inline-attachments":
      return <InlineAttachmentsScenario />;
    case "message-actions":
      return <MessageActionsScenario />;
    case "share-conversation":
      return <ShareConversationScenario />;
    case "shared-audit":
      return <SharedAuditScenario />;
    case "workspace-audit":
      return <WorkspaceAuditScenario />;
    case "workspace-membership":
      return <WorkspaceMembershipScenario />;
    default:
      return null;
  }
}

function ArtifactEditScenario() {
  const [closed, setClosed] = useState(false);

  return (
    <div className="space-y-4 p-6">
      <ArtifactEditDispatcher
        artifact={{
          ...baseArtifact,
          id: "art_code",
          kind: "preview",
          title: "Snippet"
        }}
        conversationId="conv_1"
        initialContent="hello = 1"
        onClose={() => setClosed(true)}
      />
      <p data-testid="artifact-edit-status">{closed ? "closed" : "open"}</p>
    </div>
  );
}

function ConversationListScenario() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-6">
      <ConversationList
        onSelect={(conversationId) => setSelectedConversationId(conversationId)}
        workspaceId="default-workspace"
      />
      <p data-testid="selected-conversation">{selectedConversationId ?? "none"}</p>
    </div>
  );
}

function DiffCardsScenario() {
  const [applied, setApplied] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [resolvedDigest, setResolvedDigest] = useState<string | null>(null);

  return (
    <div className="space-y-6 p-6">
      <DiffCard
        artifact={{
          ...baseArtifact,
          id: "art_diff",
          kind: "diff",
          title: "Sample diff"
        }}
        hunks={[{ after: "hello = 2", before: "hello = 1", id: "hunk-a" }]}
        onApplyHunk={setApplied}
        onRejectHunk={setRejected}
      />
      <p data-testid="diff-applied">{applied ?? "none"}</p>
      <p data-testid="diff-rejected">{rejected ?? "none"}</p>
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
        onResolve={setResolvedDigest}
      />
      <p data-testid="diff-resolved">{resolvedDigest ?? "none"}</p>
    </div>
  );
}

function HeavyAgentScenario() {
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-6">
      <HeavyAgentForm onCreated={setCreatedAgentId} workspaceId="default-workspace" />
      <p data-testid="heavy-agent-created">{createdAgentId ?? "none"}</p>
    </div>
  );
}

function InlineAttachmentsScenario() {
  return (
    <div className="grid gap-6 p-6">
      <section>
        <h2>Image states</h2>
        <MessageImageView
          artifact={{
            ...baseArtifact,
            id: "art_image_clean",
            kind: "image",
            mimeType: "image/png",
            previewUrl: "https://files.example/preview.png",
            title: "Diagram"
          }}
          scanStatus="clean"
        />
        <MessageImageView
          artifact={{
            ...baseArtifact,
            id: "art_image_pending",
            kind: "image",
            mimeType: "image/png",
            previewUrl: "https://files.example/preview.png",
            title: "Pending Diagram"
          }}
          scanStatus="pending"
        />
        <MessageImageView
          artifact={{
            ...baseArtifact,
            id: "art_image_rejected",
            kind: "image",
            mimeType: "image/png",
            previewUrl: "https://files.example/preview.png",
            title: "Rejected Diagram"
          }}
          scanStatus="rejected"
        />
      </section>
      <section>
        <h2>File states</h2>
        <MessageFileView
          artifact={{
            ...baseArtifact,
            id: "art_file_clean",
            mimeType: "text/markdown",
            previewUrl: "https://files.example/notes.md",
            title: "Notes.md"
          }}
          scanStatus="clean"
        />
        <MessageFileView
          artifact={{
            ...baseArtifact,
            id: "art_file_binary",
            mimeType: "application/octet-stream",
            previewUrl: "https://files.example/binary.bin",
            title: "Binary.bin"
          }}
          scanStatus="clean"
        />
      </section>
    </div>
  );
}

function MessageActionsScenario() {
  const [quoted, setQuoted] = useState<string | null>(null);
  const [diffApplied, setDiffApplied] = useState(false);

  return (
    <div className="space-y-4 p-6">
      <MessageActionsMenu
        conversationId="conv_1"
        messageContent="Hello world"
        messageId="msg_1"
        onApplyDiff={() => setDiffApplied(true)}
        onQuote={setQuoted}
        workspaceId="default-workspace"
      />
      <p data-testid="quoted-value">{quoted ?? "none"}</p>
      <p data-testid="diff-applied-flag">{diffApplied ? "yes" : "no"}</p>
    </div>
  );
}

function ShareConversationScenario() {
  return (
    <div className="p-6">
      <ShareConversationDialog conversationId="conv_1" onClose={() => undefined} />
    </div>
  );
}

function SharedAuditScenario() {
  return (
    <div className="p-6">
      <AccessReviewPanel conversationId="conv_1" />
    </div>
  );
}

function WorkspaceAuditScenario() {
  return (
    <div className="p-6">
      <AuditLogView workspaceId="default-workspace" />
    </div>
  );
}

function WorkspaceMembershipScenario() {
  return (
    <div className="p-6">
      <InviteDialog onClose={() => undefined} workspaceId="default-workspace" />
    </div>
  );
}
