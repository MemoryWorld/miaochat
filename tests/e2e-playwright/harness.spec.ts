import { expect, test } from "@playwright/test";

import { installClipboardMock } from "./support/browser-mocks";

function json(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    contentType: "application/json",
    status
  };
}

function apiPath(route: { request(): { url(): string } }): string {
  const url = new URL(route.request().url());
  return `${url.pathname}${url.search}`;
}

test("posts a revision and dispatches a follow-up message when the user saves", async ({
  page
}) => {
  await page.route("**/api/**", async (route) => {
    const url = apiPath(route);
    if (
      url ===
      "/api/artifacts/art_code/revisions?workspaceId=default-workspace"
    ) {
      await route.fulfill(json({ id: "rev_1", revisionIndex: 1 }, 201));
      return;
    }
    if (url === "/api/messages/send") {
      await route.fulfill(json({ id: "msg_1" }, 202));
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/e2e/artifact-edit");
  await page.getByLabel("Code editor content").fill("hello = 2");
  await page.getByRole("button", { name: "Save and dispatch" }).click();

  await expect(page.getByTestId("artifact-edit-status")).toHaveText("closed");
});

test("loads conversations, pins one, and includes the pinned indicator after refresh", async ({
  page
}) => {
  let pinned = false;

  await page.route("**/api/**", async (route) => {
    const url = apiPath(route);
    if (url.startsWith("/api/conversations?workspaceId=default-workspace")) {
      await route.fulfill(
        json([
          {
            archivedAt: null,
            id: "conv_1",
            isPinned: pinned,
            mode: "direct",
            ownerUserId: "user_owner",
            participants: [{ agentId: "agent_a", agentName: "Agent A" }],
            pinnedMessageIds: [],
            title: "Release planning",
            updatedAt: new Date().toISOString(),
            workspaceId: "default-workspace"
          }
        ])
      );
      return;
    }
    if (
      url ===
      "/api/conversations/conv_1/pin?workspaceId=default-workspace"
    ) {
      pinned = true;
      await route.fulfill(json({ id: "conv_1", isPinned: true }));
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/e2e/conversation-list");
  await page.getByRole("button", { name: "Pin" }).click();

  await expect(page.getByText(/📌 Release planning/)).toBeVisible();
});

test("renders per-hunk apply / reject controls and reports the decision", async ({ page }) => {
  await page.goto("/e2e/diff-cards");

  await page.getByTestId("diff-card-hunks").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("diff-applied")).toHaveText("hunk-a");

  await page.getByTestId("diff-card-hunks").getByRole("button", { name: "Reject" }).click();
  await expect(page.getByTestId("diff-rejected")).toHaveText("hunk-a");

  await page.getByLabel("Select branch Bob's edit").check();
  await page.getByRole("button", { name: "Apply selected branch" }).click();
  await expect(page.getByTestId("diff-resolved")).toHaveText("b".repeat(64));
});

test("registers a heavy agent with bound tools", async ({ page }) => {
  await page.route("**/api/custom-agents", async (route) => {
    await route.fulfill(json({ id: "agent_heavy_1" }, 201));
  });

  await page.goto("/e2e/heavy-agent");
  await page.getByLabel("AI 同事名称").fill("Release Driver");
  await page.getByLabel("职责说明").fill("Drive the release pipeline.");
  await page.getByRole("button", { name: "添加能力" }).click();

  await expect(page.locator('[data-binding-name="github"]')).toBeVisible();

  await page.getByRole("button", { name: "创建 AI 同事" }).click();
  await expect(page.getByTestId("heavy-agent-created")).toHaveText("agent_heavy_1");
});

test("renders inline image and file safety states", async ({ page }) => {
  await page.goto("/e2e/inline-attachments");

  await expect(page.getByRole("img", { name: "Diagram" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Pending Diagram" })).toBeVisible();
  await expect(page.getByText("Attachment was blocked by the content scanner.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View inline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible();
});

test("supports quote, copy, regenerate, and apply diff", async ({ page }) => {
  await installClipboardMock(page);
  await page.route(
    "**/api/messages/msg_1/regenerate?workspaceId=default-workspace",
    async (route) => {
      await route.fulfill(
        json(
          {
            conversationId: "conv_1",
            messageId: "msg_1",
            regenerationId: "regen_msg_1_123"
          },
          202
        )
      );
    }
  );

  await page.goto("/e2e/message-actions");
  await page.getByRole("button", { name: "复制" }).click();
  await page.getByRole("button", { name: "引用" }).click();
  await page.getByRole("button", { name: "应用 Diff" }).click();
  await page.getByRole("button", { name: "重新生成" }).click();

  await expect(page.getByTestId("quoted-value")).toHaveText("> Hello world\n\n");
  await expect(page.getByTestId("diff-applied-flag")).toHaveText("yes");
  await expect(page.getByTestId("message-actions-status")).toHaveText(
    "已加入重新生成队列。"
  );
});

test("posts user ids to the shares endpoint and reflects the new share entry", async ({
  page
}) => {
  let shared = false;

  await page.route("**/api/**", async (route) => {
    const url = apiPath(route);
    if (url === "/api/conversations/conv_1/shares") {
      if (route.request().method() === "POST") {
        shared = true;
        await route.fulfill(
          json(
            [
              {
                conversationId: "conv_1",
                createdAt: "2026-05-22T00:00:00.000Z",
                permission: "read",
                sharedWithUserId: "user_invited"
              }
            ],
            201
          )
        );
        return;
      }

      await route.fulfill(
        json(
          shared
            ? [
                {
                  conversationId: "conv_1",
                  createdAt: "2026-05-22T00:00:00.000Z",
                  permission: "read",
                  sharedWithUserId: "user_invited"
                }
              ]
            : []
        )
      );
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/e2e/share-conversation");
  await page.getByLabel("Share user ids").fill("user_invited");
  await page.getByRole("button", { name: "Share" }).click();

  await expect(page.getByText("user_invited — read")).toBeVisible();
});

test("renders the conversation access timeline of share and role events", async ({ page }) => {
  await page.route(
    "**/api/conversations/conv_1/access-review",
    async (route) => {
      await route.fulfill(
        json([
          {
            action: "conversation.share",
            actorUserId: "user_owner",
            createdAt: "2026-05-22T09:00:00.000Z",
            details: { sharedWith: ["user_alice"] },
            id: "evt_share",
            resourceId: "conv_1",
            resourceType: "conversation"
          },
          {
            action: "role.change",
            actorUserId: "user_owner",
            createdAt: "2026-05-22T09:01:00.000Z",
            details: {
              conversationId: "conv_1",
              nextRole: "admin",
              previousRole: "member"
            },
            id: "evt_role",
            resourceId: "user_alice",
            resourceType: "workspace_member"
          }
        ])
      );
    }
  );

  await page.goto("/e2e/shared-audit");
  await expect(page.getByText("conversation.share")).toBeVisible();
  await expect(page.getByText("role.change")).toBeVisible();
});

test("renders the paginated audit log and loads the next page", async ({ page }) => {
  let secondPage = false;

  await page.route("**/api/**", async (route) => {
    const url = apiPath(route);
    if (url === "/api/workspaces/default-workspace/audit") {
      await route.fulfill(
        json({
          events: [
            {
              action: "member.invite",
              actorUserId: "user_owner",
              createdAt: "2026-05-22T09:00:00.000Z",
              details: { invitedEmail: "alice@example.com", role: "member" },
              eventHash: "hash-1",
              id: "evt_1",
              previousHash: null,
              resourceId: "inv_1",
              resourceType: "workspace_invitation",
              workspaceId: "default-workspace"
            }
          ],
          nextCursor: "evt_1"
        })
      );
      return;
    }
    if (url === "/api/workspaces/default-workspace/audit?cursor=evt_1") {
      secondPage = true;
      await route.fulfill(
        json({
          events: [
            {
              action: "role.change",
              actorUserId: "user_owner",
              createdAt: "2026-05-22T08:30:00.000Z",
              details: { nextRole: "admin", previousRole: "member" },
              eventHash: "hash-2",
              id: "evt_2",
              previousHash: "hash-1",
              resourceId: "user_2",
              resourceType: "workspace_member",
              workspaceId: "default-workspace"
            }
          ],
          nextCursor: null
        })
      );
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/e2e/workspace-audit");
  await expect(page.getByText("member.invite")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("role.change")).toBeVisible();
  expect(secondPage).toBe(true);
});

test("invites a member, surfaces the issued token, and reflects the pending invitation", async ({
  page
}) => {
  let invited = false;

  await page.route("**/api/**", async (route) => {
    const url = apiPath(route);
    if (url === "/api/workspaces/default-workspace/members") {
      await route.fulfill(
        json([
          {
            joinedAt: "2026-05-22T00:00:00.000Z",
            role: "owner",
            userId: "user_owner",
            workspaceId: "default-workspace",
            workspaceOwnerUserId: "user_owner"
          }
        ])
      );
      return;
    }
    if (url === "/api/workspaces/default-workspace/invitations") {
      if (route.request().method() === "POST") {
        invited = true;
        await route.fulfill(
          json(
            {
              invitation: {
                acceptedAt: null,
                acceptedUserId: null,
                createdAt: "2026-05-22T00:01:00.000Z",
                expiresAt: "2026-05-29T00:01:00.000Z",
                id: "inv_test",
                invitedByUserId: "user_owner",
                invitedEmail: "alice@example.com",
                role: "member",
                status: "pending",
                workspaceId: "default-workspace",
                workspaceOwnerUserId: "user_owner"
              },
              token: "secret-token-123"
            },
            201
          )
        );
        return;
      }

      await route.fulfill(
        json(
          invited
            ? [
                {
                  acceptedAt: null,
                  acceptedUserId: null,
                  createdAt: "2026-05-22T00:01:00.000Z",
                  expiresAt: "2026-05-29T00:01:00.000Z",
                  id: "inv_test",
                  invitedByUserId: "user_owner",
                  invitedEmail: "alice@example.com",
                  role: "member",
                  status: "pending",
                  workspaceId: "default-workspace",
                  workspaceOwnerUserId: "user_owner"
                }
              ]
            : []
        )
      );
      return;
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/e2e/workspace-membership");
  await expect(page.getByText(/user_owner — owner/)).toBeVisible();

  await page.getByLabel("Invited email").fill("alice@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();

  await expect(page.getByTestId("latest-token")).toContainText("secret-token-123");
  await expect(page.getByText(/alice@example.com \(member\)/)).toBeVisible();
});
