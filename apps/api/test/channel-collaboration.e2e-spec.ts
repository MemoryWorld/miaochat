import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client } from "pg";

import { createApp } from "../src/main.js";
import { signupSessionViaInject } from "../../../tests/support/auth-session.js";

const workspaceId = "workspace_phase_f_channel";
const agentId = "agent_phase_f_engineer";

describe("phase f channel collaboration", () => {
  let app: NestFastifyApplication;
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:5432/agenthub"
    });
    await client.connect();
    await clearFixtures(client);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await clearFixtures(client);
    await client.end();
  });

  it("invites a real coworker, enforces channel permissions, and stops dispatch after AI removal", async () => {
    const owner = await signupSessionViaInject(app, {
      displayName: "频道所有者",
      email: `phase-f-owner-${Date.now()}@example.com`
    });
    const coworker = await signupSessionViaInject(app, {
      displayName: "张三",
      email: `phase-f-coworker-${Date.now()}@example.com`
    });

    await client.query(
      `
        INSERT INTO workspaces (id, name, owner_user_id)
        VALUES ($1, 'Phase F Workspace', $2)
        ON CONFLICT (owner_user_id, id) DO NOTHING
      `,
      [workspaceId, owner.user.id]
    );
    await client.query(
      `
        INSERT INTO workspace_members (
          workspace_id,
          workspace_owner_user_id,
          user_id,
          role
        )
        VALUES
          ($1, $2, $2, 'owner'),
          ($1, $2, $3, 'member')
        ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO UPDATE
          SET role = EXCLUDED.role
      `,
      [workspaceId, owner.user.id, coworker.user.id]
    );
    await seedAgent(client, owner.user.id);

    const conversationResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "POST",
      payload: {
        agentIds: [agentId],
        mode: "direct",
        title: "Phase F 频道",
        workspaceId
      },
      url: "/conversations"
    });

    expect(conversationResponse.statusCode).toBe(201);
    const channelId = conversationResponse.json().id as string;

    const inviteResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "POST",
      payload: {
        permission: "comment",
        userIds: [coworker.user.id],
        workspaceId
      },
      url: `/channels/${channelId}/members/humans`
    });

    expect(inviteResponse.statusCode).toBe(201);
    expect(inviteResponse.json().members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "张三",
          kind: "human",
          permission: "comment",
          userId: coworker.user.id
        })
      ])
    );

    const coworkerMessageResponse = await app.inject({
      headers: { cookie: coworker.cookie },
      method: "POST",
      payload: {
        content: "我可以在这个频道发言。",
        conversationId: channelId,
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(coworkerMessageResponse.statusCode).toBe(201);
    expect(coworkerMessageResponse.json()).toMatchObject({
      authorUserId: coworker.user.id,
      ownerUserId: owner.user.id
    });
    const coworkerMessageId = coworkerMessageResponse.json().id as string;

    const ownerHistoryResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/messages?conversationId=${channelId}&workspaceId=${workspaceId}`
    });

    expect(ownerHistoryResponse.statusCode).toBe(200);
    expect(ownerHistoryResponse.json()).toEqual([
      expect.objectContaining({
        author: expect.objectContaining({
          displayName: "张三",
          kind: "human",
          userId: coworker.user.id
        }),
        content: "我可以在这个频道发言。"
      })
    ]);

    const ownerReadStateResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/channels/${channelId}/read-state?workspaceId=${workspaceId}`
    });

    expect(ownerReadStateResponse.statusCode).toBe(200);
    expect(ownerReadStateResponse.json()).toMatchObject({
      notificationPreference: "all",
      unreadCount: 1
    });

    const markReadResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "POST",
      payload: {
        lastReadMessageId: coworkerMessageId,
        workspaceId
      },
      url: `/channels/${channelId}/read-state`
    });

    expect(markReadResponse.statusCode).toBe(200);
    expect(markReadResponse.json()).toMatchObject({
      lastReadMessageId: coworkerMessageId,
      unreadCount: 0
    });

    const notificationResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "PATCH",
      payload: {
        notificationPreference: "mentions_only",
        workspaceId
      },
      url: `/channels/${channelId}/notification-preference`
    });

    expect(notificationResponse.statusCode).toBe(200);
    expect(notificationResponse.json()).toMatchObject({
      notificationPreference: "mentions_only"
    });

    const threadReplyResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "POST",
      payload: {
        content: "线程里确认收到。",
        conversationId: channelId,
        role: "user",
        threadParentMessageId: coworkerMessageId,
        workspaceId
      },
      url: "/messages"
    });

    expect(threadReplyResponse.statusCode).toBe(201);
    expect(threadReplyResponse.json()).toMatchObject({
      content: "线程里确认收到。",
      threadParentMessageId: coworkerMessageId
    });

    const threadResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/messages/${coworkerMessageId}/thread?workspaceId=${workspaceId}`
    });

    expect(threadResponse.statusCode).toBe(200);
    expect(threadResponse.json()).toMatchObject({
      parent: {
        id: coworkerMessageId,
        threadReplyCount: 1
      },
      replies: [
        expect.objectContaining({
          content: "线程里确认收到。",
          threadParentMessageId: coworkerMessageId
        })
      ]
    });

    const reactionResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "POST",
      payload: {
        emoji: "✅",
        workspaceId
      },
      url: `/messages/${coworkerMessageId}/reactions`
    });

    expect(reactionResponse.statusCode).toBe(200);
    expect(reactionResponse.json().reactions).toEqual([
      {
        count: 1,
        emoji: "✅",
        reactedByCurrentUser: true
      }
    ]);

    const artifactResponse = await app.inject({
      headers: { cookie: coworker.cookie },
      method: "POST",
      payload: {
        kind: "attachment",
        messageId: coworkerMessageId,
        mimeType: "text/plain",
        previewUrl: null,
        storageKey: `test/${coworkerMessageId}/notes.txt`,
        title: "notes.txt",
        workspaceId
      },
      url: "/artifacts"
    });

    expect(artifactResponse.statusCode).toBe(201);

    const channelFilesResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "GET",
      url: `/channel-files?channelId=${channelId}&workspaceId=${workspaceId}`
    });

    expect(channelFilesResponse.statusCode).toBe(200);
    expect(channelFilesResponse.json()).toEqual([
      expect.objectContaining({
        messageId: coworkerMessageId,
        title: "notes.txt"
      })
    ]);

    const permissionResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "PATCH",
      payload: {
        permission: "read",
        workspaceId
      },
      url: `/channels/${channelId}/members/${encodeURIComponent(
        `human:${coworker.user.id}`
      )}`
    });

    expect(permissionResponse.statusCode).toBe(200);

    const readOnlySendResponse = await app.inject({
      headers: { cookie: coworker.cookie },
      method: "POST",
      payload: {
        content: "这条消息应该被拒绝。",
        conversationId: channelId,
        role: "user",
        workspaceId
      },
      url: "/messages"
    });

    expect(readOnlySendResponse.statusCode).toBe(403);

    const removeCoworkerResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "DELETE",
      url: `/channels/${channelId}/members/${encodeURIComponent(
        `human:${coworker.user.id}`
      )}?workspaceId=${workspaceId}`
    });

    expect(removeCoworkerResponse.statusCode).toBe(200);

    const removedReadResponse = await app.inject({
      headers: { cookie: coworker.cookie },
      method: "GET",
      url: `/messages?conversationId=${channelId}&workspaceId=${workspaceId}`
    });

    expect(removedReadResponse.statusCode).toBe(403);

    const removeAiResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "DELETE",
      url: `/channels/${channelId}/members/${encodeURIComponent(
        `ai:${agentId}`
      )}?workspaceId=${workspaceId}`
    });

    expect(removeAiResponse.statusCode).toBe(200);

    const humanOnlySendResponse = await app.inject({
      headers: { cookie: owner.cookie },
      method: "POST",
      payload: {
        content: "没有 AI 同事时也应该保存。",
        conversationId: channelId,
        role: "user",
        workspaceId
      },
      url: "/messages/send"
    });

    expect(humanOnlySendResponse.statusCode).toBe(202);
    expect(humanOnlySendResponse.json()).toMatchObject({
      content: "没有 AI 同事时也应该保存。"
    });
  });
});

async function seedAgent(client: Client, ownerUserId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO custom_agents (
        id,
        avatar_url,
        capability_tags,
        name,
        owner_user_id,
        provider,
        system_prompt,
        tool_bindings,
        workspace_id
      )
      VALUES ($1, null, '[]'::jsonb, '软件工程师', $2, 'deepseek', '负责实现。', '[]'::jsonb, $3)
      ON CONFLICT DO NOTHING
    `,
    [agentId, ownerUserId, workspaceId]
  );
}

async function clearFixtures(client: Client): Promise<void> {
  await client.query("DELETE FROM conversations WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM custom_agents WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM workspace_members WHERE workspace_id = $1", [workspaceId]);
  await client.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
}
