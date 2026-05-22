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

test("creates a mock conversation, streams a reply, and reloads the persisted assistant message", async ({
  page
}) => {
  const createdConversation = {
    id: "conv_mock_ui",
    mode: "direct",
    ownerUserId: "system-user",
    participants: [{ agentId: "agent_mock", agentName: "Mock Builder" }],
    pinnedMessageIds: [],
    title: "Mock Builder session",
    updatedAt: new Date().toISOString(),
    workspaceId: "default-workspace"
  };
  const userMessage = {
    content: "Build the mock slice",
    conversationId: "conv_mock_ui",
    createdAt: new Date().toISOString(),
    id: "msg_user_mock_ui",
    isPinned: false,
    role: "user",
    sourceAgentId: null,
    workspaceId: "default-workspace"
  };
  const persistedMessages = [
    userMessage,
    {
      content: "[mock:agent_mock] Build the mock slice",
      conversationId: "conv_mock_ui",
      createdAt: new Date().toISOString(),
      id: "msg_assistant_mock_ui",
      isPinned: false,
      role: "assistant",
      sourceAgentId: "agent_mock",
      workspaceId: "default-workspace"
    }
  ];

  let messageListRefreshes = 0;

  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();

    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([]));
      return;
    }
    if (url === "http://localhost:3001/conversations?workspaceId=default-workspace") {
      await route.fulfill(json(messageListRefreshes > 0 ? [createdConversation] : []));
      return;
    }
    if (url === "http://localhost:3001/conversations") {
      messageListRefreshes += 1;
      await route.fulfill(json(createdConversation, 201));
      return;
    }
    if (
      url ===
      "http://localhost:3001/messages?conversationId=conv_mock_ui&workspaceId=default-workspace"
    ) {
      await route.fulfill(json(messageListRefreshes > 1 ? persistedMessages : [], 200));
      return;
    }
    if (url === "http://localhost:3001/messages/send") {
      messageListRefreshes += 1;
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

  await page.getByRole("button", { name: "Start mock conversation" }).click();
  await page.getByLabel("Message").fill("Build the mock slice");
  await page.getByRole("button", { name: "Send message" }).click();

  await emitEventSourceOpen(page);
  await emitEventSourceMessage(page, {
    kind: "conversation.message.started",
    payload: { messageId: "msg_assistant_mock_ui" }
  });
  await emitEventSourceMessage(page, {
    kind: "conversation.message.delta",
    payload: {
      delta: "[mock:agent_mock] Build the mock slice",
      messageId: "msg_assistant_mock_ui"
    }
  });
  await emitEventSourceMessage(page, {
    kind: "conversation.message.completed",
    payload: {
      finalContent: "[mock:agent_mock] Build the mock slice",
      messageId: "msg_assistant_mock_ui"
    }
  });

  await expect(page.getByText("[mock:agent_mock] Build the mock slice")).toBeVisible();
});

test("creates a direct conversation from a selected custom agent", async ({ page }) => {
  const customAgent = {
    avatarUrl: null,
    capabilityTags: ["release", "writing"],
    id: "agent_release_drafter",
    name: "Release Drafter",
    provider: "codex",
    systemPrompt: "Draft release notes and changelog summaries.",
    toolBindings: [],
    workspaceId: "default-workspace"
  };
  const createdConversation = {
    id: "conv_release_drafter",
    mode: "direct",
    ownerUserId: "system-user",
    participants: [{ agentId: customAgent.id, agentName: customAgent.name }],
    pinnedMessageIds: [],
    title: "Release Drafter session",
    updatedAt: new Date().toISOString(),
    workspaceId: "default-workspace"
  };

  let conversationsVisible = false;

  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();

    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([]));
      return;
    }
    if (url === "http://localhost:3001/conversations?workspaceId=default-workspace") {
      await route.fulfill(json(conversationsVisible ? [createdConversation] : []));
      return;
    }
    if (url === "http://localhost:3001/custom-agents?workspaceId=default-workspace") {
      await route.fulfill(json([customAgent]));
      return;
    }
    if (url === "http://localhost:3001/conversations") {
      conversationsVisible = true;
      await route.fulfill(json(createdConversation, 201));
      return;
    }
    if (
      url ===
      "http://localhost:3001/messages?conversationId=conv_release_drafter&workspaceId=default-workspace"
    ) {
      await route.fulfill(json([]));
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/");

  await page.getByRole("button", { name: "New conversation" }).click();
  await page.getByLabel("Agent").selectOption(customAgent.id);
  await page.getByRole("button", { name: "Create conversation" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Release Drafter session" })
  ).toBeVisible();
});

test("loads workspaces, switches the active workspace, and persists the selection", async ({
  page
}) => {
  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();

    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(
        json([
          {
            createdAt: "2026-05-22T00:00:00.000Z",
            id: "default-workspace",
            name: "Default Workspace",
            ownerUserId: "user_owner",
            updatedAt: "2026-05-22T00:00:00.000Z"
          },
          {
            createdAt: "2026-05-22T00:00:00.000Z",
            id: "workspace_alpha",
            name: "Alpha",
            ownerUserId: "user_owner",
            updatedAt: "2026-05-22T00:00:00.000Z"
          }
        ])
      );
      return;
    }

    if (url === "http://localhost:3001/conversations?workspaceId=default-workspace") {
      await route.fulfill(json([]));
      return;
    }

    if (url === "http://localhost:3001/conversations?workspaceId=workspace_alpha") {
      await route.fulfill(
        json([
          {
            id: "conv_alpha",
            mode: "direct",
            ownerUserId: "user_owner",
            participants: [{ agentId: "agent_alpha", agentName: "Alpha Agent" }],
            pinnedMessageIds: [],
            title: "Alpha session",
            updatedAt: new Date().toISOString(),
            workspaceId: "workspace_alpha"
          }
        ])
      );
      return;
    }

    if (
      url ===
      "http://localhost:3001/messages?conversationId=conv_alpha&workspaceId=workspace_alpha"
    ) {
      await route.fulfill(json([]));
      return;
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/");

  await expect(page.getByLabel("Active workspace")).toHaveValue("default-workspace");

  await page.getByLabel("Active workspace").selectOption("workspace_alpha");

  await expect(page.getByRole("heading", { name: "Alpha session" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("agenthub.activeWorkspaceId"))
    )
    .toBe("workspace_alpha");
});
