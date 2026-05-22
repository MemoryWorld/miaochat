import { expect, test } from "@playwright/test";

import {
  emitEventSourceMessage,
  emitEventSourceOpen,
  installEventSourceMock
} from "./support/browser-mocks";

function json(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    contentType: "application/json",
    status
  };
}

test.beforeEach(async ({ page }) => {
  await installEventSourceMock(page);
});

test("renders preview, attachment, and baseline diff artifact cards within the chat timeline", async ({
  page
}) => {
  const conversation = {
    id: "conv_artifacts_ui",
    mode: "direct",
    ownerUserId: "system-user",
    participants: [{ agentId: "agent_artifact_operator", agentName: "Artifact Operator" }],
    pinnedMessageIds: [],
    title: "Artifact Operator session",
    updatedAt: "2026-05-21T11:00:00.000Z",
    workspaceId: "default-workspace"
  };
  const userMessage = {
    content: "Generate the release artifacts",
    conversationId: conversation.id,
    createdAt: "2026-05-21T11:01:00.000Z",
    id: "msg_user_artifacts",
    isPinned: false,
    mentionedAgentIds: [],
    role: "user",
    sourceAgentId: null,
    workspaceId: conversation.workspaceId
  };
  const assistantMessage = {
    content: "Here is the release bundle with three artifacts.",
    conversationId: conversation.id,
    createdAt: "2026-05-21T11:01:30.000Z",
    id: "msg_assistant_artifacts",
    isPinned: false,
    mentionedAgentIds: [],
    role: "assistant",
    sourceAgentId: "agent_artifact_operator",
    workspaceId: conversation.workspaceId
  };

  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();
    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([]));
      return;
    }
    if (url.startsWith("http://localhost:3001/conversations?")) {
      await route.fulfill(json([conversation]));
      return;
    }
    if (url.startsWith("http://localhost:3001/messages?")) {
      await route.fulfill(json([userMessage, assistantMessage]));
      return;
    }
    if (url.startsWith(`http://localhost:3001/artifacts?messageId=${userMessage.id}`)) {
      await route.fulfill(json([]));
      return;
    }
    if (url.startsWith(`http://localhost:3001/artifacts?messageId=${assistantMessage.id}`)) {
      await route.fulfill(
        json([
          {
            createdAt: "2026-05-21T11:01:45.000Z",
            id: "artifact_preview",
            kind: "preview",
            messageId: assistantMessage.id,
            mimeType: "image/png",
            previewUrl: "http://localhost:9000/agenthub-dev/release-summary.png",
            storageKey:
              "artifacts/default-workspace/msg_assistant_artifacts/preview-summary.png",
            title: "Release summary preview",
            workspaceId: conversation.workspaceId
          },
          {
            createdAt: "2026-05-21T11:01:50.000Z",
            id: "artifact_attachment",
            kind: "attachment",
            messageId: assistantMessage.id,
            mimeType: "text/markdown",
            previewUrl: null,
            storageKey:
              "artifacts/default-workspace/msg_assistant_artifacts/release-checklist.md",
            title: "Release checklist",
            workspaceId: conversation.workspaceId
          },
          {
            createdAt: "2026-05-21T11:01:55.000Z",
            id: "artifact_diff",
            kind: "diff",
            messageId: assistantMessage.id,
            mimeType: "text/x-diff",
            previewUrl: null,
            storageKey: "artifacts/default-workspace/msg_assistant_artifacts/release.diff",
            title: "Release diff",
            workspaceId: conversation.workspaceId
          }
        ])
      );
      return;
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/");

  await expect(page.getByLabel("Preview artifact Release summary preview")).toBeVisible();
  await expect(page.getByLabel("Attachment artifact Release checklist")).toBeVisible();
  await expect(page.getByLabel("Diff artifact Release diff")).toBeVisible();
});

test("renders a structured partial-failure status card while keeping the degraded reply visible", async ({
  page
}) => {
  const conversation = {
    id: "conv_group_failure_ui",
    mode: "group",
    ownerUserId: "system-user",
    participants: [
      { agentId: "agent_hermes", agentName: "Hermes Planner" },
      { agentId: "agent_failure", agentName: "Failure Scout" },
      { agentId: "agent_timeout", agentName: "Timeout Watcher" }
    ],
    pinnedMessageIds: [],
    title: "Group rollback planning",
    updatedAt: new Date().toISOString(),
    workspaceId: "default-workspace"
  };
  const userMessage = {
    content: "Plan the rollback path",
    conversationId: conversation.id,
    createdAt: new Date().toISOString(),
    id: "msg_group_failure_user",
    isPinned: false,
    mentionedAgentIds: [],
    role: "user",
    sourceAgentId: null,
    workspaceId: "default-workspace"
  };
  const assistantMessage = {
    content:
      "[Hermes Planner]\n[mock-group:agent_hermes] Plan the rollback path\n\nPartial failure\n- Failure Scout\n- Timeout Watcher",
    conversationId: conversation.id,
    createdAt: new Date().toISOString(),
    id: "msg_group_failure_assistant",
    isPinned: false,
    mentionedAgentIds: [],
    role: "assistant",
    sourceAgentId: null,
    workspaceId: "default-workspace"
  };

  let messageRefresh = 0;

  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();
    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([]));
      return;
    }
    if (url === "http://localhost:3001/conversations?workspaceId=default-workspace") {
      await route.fulfill(json([conversation]));
      return;
    }
    if (
      url ===
      "http://localhost:3001/messages?conversationId=conv_group_failure_ui&workspaceId=default-workspace"
    ) {
      await route.fulfill(json(messageRefresh > 0 ? [userMessage, assistantMessage] : []));
      return;
    }
    if (url === "http://localhost:3001/messages/send") {
      messageRefresh += 1;
      await route.fulfill(json(userMessage, 202));
      return;
    }
    if (url.startsWith("http://localhost:3001/artifacts?messageId=")) {
      await route.fulfill(json([]));
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/");

  await page.getByLabel("Message").fill("Plan the rollback path");
  await page.getByRole("button", { name: "Send message" }).click();

  await emitEventSourceOpen(page);
  await emitEventSourceMessage(page, {
    kind: "conversation.status",
    payload: {
      failures: [
        {
          agentId: "agent_failure",
          agentName: "Failure Scout",
          code: "error",
          detail: "Mock dispatch failed before completion.",
          provider: "mock"
        },
        {
          agentId: "agent_timeout",
          agentName: "Timeout Watcher",
          code: "timeout",
          detail: "Mock dispatch timed out before completion.",
          provider: "mock"
        }
      ],
      label: "orchestrator.partial_failure",
      state: "failed",
      successfulAgentCount: 1,
      summary: "2 of 3 agents failed or timed out. Aggregated the remaining result.",
      totalAgentCount: 3
    }
  });
  await emitEventSourceMessage(page, {
    kind: "conversation.message.started",
    payload: { messageId: assistantMessage.id }
  });
  await emitEventSourceMessage(page, {
    kind: "conversation.message.delta",
    payload: { delta: assistantMessage.content, messageId: assistantMessage.id }
  });
  await emitEventSourceMessage(page, {
    kind: "conversation.message.completed",
    payload: { finalContent: assistantMessage.content, messageId: assistantMessage.id }
  });

  await expect(page.getByText("Orchestrator partial failure")).toBeVisible();
  await expect(page.getByText("Failure Scout · error")).toBeVisible();
  await expect(page.getByText("Timeout Watcher · timeout")).toBeVisible();
});

test("pins a message and uses it in the next streamed assistant reply", async ({ page }) => {
  const createdConversation = {
    id: "conv_pinned_ui",
    mode: "direct",
    ownerUserId: "system-user",
    participants: [{ agentId: "agent_mock", agentName: "Mock Builder" }],
    pinnedMessageIds: [],
    title: "Mock Builder session",
    updatedAt: new Date().toISOString(),
    workspaceId: "default-workspace"
  };
  const firstUserMessage = {
    content: "Remember this pinned note",
    conversationId: "conv_pinned_ui",
    createdAt: new Date().toISOString(),
    id: "msg_user_pinned_1",
    isPinned: false,
    role: "user",
    sourceAgentId: null,
    workspaceId: "default-workspace"
  };
  const secondUserMessage = {
    content: "Use the pinned note",
    conversationId: "conv_pinned_ui",
    createdAt: new Date().toISOString(),
    id: "msg_user_pinned_2",
    isPinned: false,
    role: "user",
    sourceAgentId: null,
    workspaceId: "default-workspace"
  };
  const pinnedFirstMessage = { ...firstUserMessage, isPinned: true };
  const assistantMessage = {
    content: "[mock:agent_mock] Use the pinned note\n[pinned] Remember this pinned note",
    conversationId: "conv_pinned_ui",
    createdAt: new Date().toISOString(),
    id: "msg_assistant_pinned",
    isPinned: false,
    role: "assistant",
    sourceAgentId: "agent_mock",
    workspaceId: "default-workspace"
  };

  let sendCount = 0;

  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();
    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([]));
      return;
    }
    if (url === "http://localhost:3001/conversations?workspaceId=default-workspace") {
      await route.fulfill(json(sendCount > 0 ? [createdConversation] : []));
      return;
    }
    if (url === "http://localhost:3001/conversations") {
      sendCount += 1;
      await route.fulfill(json(createdConversation, 201));
      return;
    }
    if (
      url ===
      "http://localhost:3001/messages?conversationId=conv_pinned_ui&workspaceId=default-workspace"
    ) {
      await route.fulfill(
        json(sendCount > 2 ? [pinnedFirstMessage, secondUserMessage, assistantMessage] : [])
      );
      return;
    }
    if (url === "http://localhost:3001/messages/send") {
      sendCount += 1;
      await route.fulfill(json(sendCount === 2 ? firstUserMessage : secondUserMessage, 202));
      return;
    }
    if (
      url ===
      "http://localhost:3001/messages/msg_user_pinned_1/pin?workspaceId=default-workspace"
    ) {
      await route.fulfill(
        json({ message: pinnedFirstMessage, pinnedMessageIds: [firstUserMessage.id] })
      );
      return;
    }
    if (url.startsWith("http://localhost:3001/artifacts?messageId=")) {
      await route.fulfill(json([]));
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Start mock conversation" }).click();
  await emitEventSourceOpen(page);

  await page.getByLabel("Message").fill("Remember this pinned note");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Pin message" }).click();
  await expect(page.getByText("Pinned")).toBeVisible();

  await page.getByLabel("Message").fill("Use the pinned note");
  await page.getByRole("button", { name: "Send message" }).click();

  await emitEventSourceMessage(page, {
    kind: "conversation.message.started",
    payload: { messageId: assistantMessage.id }
  });
  await emitEventSourceMessage(page, {
    kind: "conversation.message.delta",
    payload: { delta: assistantMessage.content, messageId: assistantMessage.id }
  });
  await emitEventSourceMessage(page, {
    kind: "conversation.message.completed",
    payload: { finalContent: assistantMessage.content, messageId: assistantMessage.id }
  });

  await expect(page.getByText("[pinned] Remember this pinned note")).toBeVisible();
});

test("dispatches /deploy to the deploy endpoint and renders a deploy status card", async ({
  page
}) => {
  const workspace = {
    createdAt: "2026-05-22T00:00:00.000Z",
    id: "workspace_deploy",
    name: "Deploy Workspace",
    ownerUserId: "user_owner",
    updatedAt: "2026-05-22T00:00:00.000Z"
  };
  const conversation = {
    id: "conv_deploy",
    mode: "direct",
    ownerUserId: "user_owner",
    participants: [{ agentId: "agent_deployer", agentName: "Deploy Agent" }],
    pinnedMessageIds: [],
    title: "Deploy conversation",
    updatedAt: "2026-05-22T01:00:00.000Z",
    workspaceId: workspace.id
  };
  const assistantMessage = {
    content: "The build artifact is ready.",
    conversationId: conversation.id,
    createdAt: "2026-05-22T01:02:00.000Z",
    id: "msg_assistant_deploy",
    isPinned: false,
    mentionedAgentIds: [],
    role: "assistant",
    sourceAgentId: "agent_deployer",
    workspaceId: workspace.id
  };
  const artifact = {
    createdAt: "2026-05-22T01:02:05.000Z",
    id: "artifact_deploy_bundle",
    kind: "attachment",
    messageId: assistantMessage.id,
    mimeType: "application/zip",
    previewUrl: null,
    storageKey: "artifacts/workspace_deploy/msg_assistant_deploy/site.zip",
    title: "Marketing Site Bundle",
    workspaceId: workspace.id
  };

  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();
    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([workspace]));
      return;
    }
    if (url === "http://localhost:3001/conversations?workspaceId=default-workspace") {
      await route.fulfill(json([]));
      return;
    }
    if (url === `http://localhost:3001/conversations?workspaceId=${workspace.id}`) {
      await route.fulfill(json([conversation]));
      return;
    }
    if (
      url ===
      `http://localhost:3001/messages?conversationId=${conversation.id}&workspaceId=${workspace.id}`
    ) {
      await route.fulfill(json([assistantMessage]));
      return;
    }
    if (
      url ===
      `http://localhost:3001/artifacts?messageId=${assistantMessage.id}&workspaceId=${workspace.id}`
    ) {
      await route.fulfill(json([artifact]));
      return;
    }
    if (url === "http://localhost:3001/deploys") {
      await route.fulfill(
        json(
          {
            artifact,
            deployment: {
              artifactId: artifact.id,
              completedAt: "2026-05-22T01:03:00.000Z",
              createdAt: "2026-05-22T01:02:30.000Z",
              deployTargetId: "target_marketing_preview",
              errorMessage: null,
              id: "deployment_marketing_preview",
              ownerUserId: "user_owner",
              previewUrl: "https://preview.workspace.example/marketing-site",
              progressEvents: [],
              resultMessage: "Static site deployed to preview.",
              startedAt: "2026-05-22T01:02:30.000Z",
              status: "succeeded",
              targetKind: "static-site",
              updatedAt: "2026-05-22T01:03:00.000Z",
              workspaceId: workspace.id
            },
            target: {
              credentialSource: "user_provided",
              hasSecret: true,
              id: "target_marketing_preview",
              kind: "static-site",
              name: "Marketing Preview",
              workspaceId: workspace.id
            }
          },
          201
        )
      );
      return;
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/");

  await page.getByLabel("Active workspace").selectOption(workspace.id);
  await page.getByRole("textbox", { name: "Message" }).fill("/deploy Marketing Preview");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByLabel("Deploy status card for Marketing Site Bundle")).toBeVisible();
  await expect(page.getByText("Static site deployed to preview.")).toBeVisible();
});
