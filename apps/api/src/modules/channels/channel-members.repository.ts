import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";

export type ChannelConversationRow = {
  id: string;
  owner_user_id: string;
  title: string;
  workspace_id: string;
};

export type ChannelHumanMemberRow = {
  created_at: Date;
  display_name: string | null;
  email: string | null;
  id: string;
  invited_email: string | null;
  joined_at: Date | null;
  last_read_at: Date | null;
  last_read_message_id?: string | null;
  last_active_at: Date | null;
  notification_preference?: "all" | "mentions_only" | "muted";
  permission: "comment" | "manage" | "read";
  role: "admin" | "guest" | "member" | "owner";
  status: "active" | "disabled" | "pending" | "removed";
  user_id: string | null;
};

export type ChannelAiMemberRow = {
  agent_id: string;
  agent_name: string;
  avatar_url: string | null;
  created_at: Date | null;
};

export type WorkspaceUserRow = {
  display_name: string;
  email: string;
  id: string;
};

export type PendingWorkspaceInvitationRow = {
  id: string;
};

export type ChannelReadStateRow = {
  last_read_at: Date | null;
  last_read_message_id: string | null;
  notification_preference: "all" | "mentions_only" | "muted";
  unread_count: number;
};

@Injectable()
export class ChannelMembersRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findChannel(
    channelId: string,
    workspaceId: string
  ): Promise<ChannelConversationRow | null> {
    const result = await this.database.query<ChannelConversationRow>(
      `
        SELECT id, owner_user_id, title, workspace_id
        FROM conversations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [channelId, workspaceId]
    );

    return result.rows[0] ?? null;
  }

  async findUser(userId: string): Promise<WorkspaceUserRow | null> {
    const result = await this.database.query<WorkspaceUserRow>(
      `
        SELECT display_name, email, id
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    return result.rows[0] ?? null;
  }

  async findWorkspaceUserByEmail(input: {
    email: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<WorkspaceUserRow | null> {
    const result = await this.database.query<WorkspaceUserRow>(
      `
        SELECT users.display_name, users.email, users.id
        FROM users
        INNER JOIN workspace_members
          ON workspace_members.user_id = users.id
          AND workspace_members.workspace_owner_user_id = $1
          AND workspace_members.workspace_id = $2
        WHERE lower(users.email) = $3
        LIMIT 1
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.email.trim().toLowerCase()
      ]
    );

    return result.rows[0] ?? null;
  }

  async findPendingWorkspaceInvitationByEmail(input: {
    email: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<PendingWorkspaceInvitationRow | null> {
    const result = await this.database.query<PendingWorkspaceInvitationRow>(
      `
        SELECT id
        FROM workspace_invitations
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND lower(invited_email) = $3
          AND status = 'pending'
        LIMIT 1
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.email.trim().toLowerCase()
      ]
    );

    return result.rows[0] ?? null;
  }

  async listHumanMembers(input: {
    channelId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<ChannelHumanMemberRow[]> {
    const result = await this.database.query<ChannelHumanMemberRow>(
      `
        SELECT
          channel_user_memberships.created_at,
          channel_user_memberships.id,
          channel_user_memberships.invited_email,
          channel_user_memberships.joined_at,
          channel_user_memberships.last_read_at,
          channel_user_memberships.last_read_message_id,
          channel_user_memberships.notification_preference,
          channel_user_memberships.permission,
          channel_user_memberships.role,
          channel_user_memberships.status,
          channel_user_memberships.user_id,
          users.display_name,
          users.email,
          NULL::timestamptz AS last_active_at
        FROM channel_user_memberships
        LEFT JOIN users
          ON users.id = channel_user_memberships.user_id
        WHERE channel_user_memberships.workspace_owner_user_id = $1
          AND channel_user_memberships.workspace_id = $2
          AND channel_user_memberships.channel_id = $3
          AND channel_user_memberships.removed_at IS NULL
        ORDER BY
          CASE channel_user_memberships.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'member' THEN 2
            ELSE 3
          END,
          channel_user_memberships.created_at ASC,
          channel_user_memberships.id ASC
      `,
      [input.workspaceOwnerUserId, input.workspaceId, input.channelId]
    );

    return result.rows;
  }

  async listAiMembers(input: {
    channelId: string;
    workspaceId: string;
  }): Promise<ChannelAiMemberRow[]> {
    const result = await this.database.query<ChannelAiMemberRow>(
      `
        SELECT
          conversation_agents.agent_id,
          conversation_agents.agent_name,
          custom_agents.avatar_url,
          custom_agents.created_at
        FROM conversation_agents
        LEFT JOIN custom_agents
          ON custom_agents.id = conversation_agents.agent_id
          AND custom_agents.workspace_id = conversation_agents.workspace_id
        WHERE conversation_agents.workspace_id = $1
          AND conversation_agents.conversation_id = $2
        ORDER BY conversation_agents.agent_name ASC, conversation_agents.agent_id ASC
      `,
      [input.workspaceId, input.channelId]
    );

    return result.rows;
  }

  async findActiveHumanMembership(input: {
    channelId: string;
    userId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<ChannelHumanMemberRow | null> {
    const result = await this.database.query<ChannelHumanMemberRow>(
      `
        SELECT
          channel_user_memberships.created_at,
          channel_user_memberships.id,
          channel_user_memberships.invited_email,
          channel_user_memberships.joined_at,
          channel_user_memberships.last_read_at,
          channel_user_memberships.last_read_message_id,
          channel_user_memberships.notification_preference,
          channel_user_memberships.permission,
          channel_user_memberships.role,
          channel_user_memberships.status,
          channel_user_memberships.user_id,
          users.display_name,
          users.email,
          NULL::timestamptz AS last_active_at
        FROM channel_user_memberships
        LEFT JOIN users
          ON users.id = channel_user_memberships.user_id
        WHERE channel_user_memberships.workspace_owner_user_id = $1
          AND channel_user_memberships.workspace_id = $2
          AND channel_user_memberships.channel_id = $3
          AND channel_user_memberships.user_id = $4
          AND channel_user_memberships.status = 'active'
          AND channel_user_memberships.removed_at IS NULL
        LIMIT 1
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.userId
      ]
    );

    return result.rows[0] ?? null;
  }

  async upsertActiveHumanMember(input: {
    channelId: string;
    invitedByUserId: string;
    permission: "comment" | "read";
    role?: "admin" | "guest" | "member" | "owner";
    userId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<void> {
    await this.database.query(
      `
        INSERT INTO channel_user_memberships (
          id,
          channel_id,
          workspace_id,
          workspace_owner_user_id,
          user_id,
          role,
          permission,
          status,
          invited_by_user_id,
          joined_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, now())
        ON CONFLICT (
          workspace_owner_user_id,
          workspace_id,
          channel_id,
          user_id
        )
        WHERE user_id IS NOT NULL AND removed_at IS NULL
        DO UPDATE
          SET permission = CASE
                WHEN channel_user_memberships.role = 'owner'
                  THEN channel_user_memberships.permission
                ELSE EXCLUDED.permission
              END,
              status = 'active',
              joined_at = COALESCE(channel_user_memberships.joined_at, now()),
              updated_at = now()
      `,
      [
        randomUUID(),
        input.channelId,
        input.workspaceId,
        input.workspaceOwnerUserId,
        input.userId,
        input.role ?? "member",
        input.permission,
        input.invitedByUserId
      ]
    );
  }

  async ensureOwnerMembership(input: {
    channelId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<void> {
    await this.database.query(
      `
        INSERT INTO channel_user_memberships (
          id,
          channel_id,
          workspace_id,
          workspace_owner_user_id,
          user_id,
          role,
          permission,
          status,
          invited_by_user_id,
          joined_at
        )
        VALUES ($1, $2, $3, $4, $4, 'owner', 'manage', 'active', $4, now())
        ON CONFLICT (
          workspace_owner_user_id,
          workspace_id,
          channel_id,
          user_id
        )
        WHERE user_id IS NOT NULL AND removed_at IS NULL
        DO NOTHING
      `,
      [
        `channel-owner:${input.channelId}:${input.workspaceOwnerUserId}`,
        input.channelId,
        input.workspaceId,
        input.workspaceOwnerUserId
      ]
    );
  }

  async findMessageInChannel(input: {
    channelId: string;
    messageId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<{ id: string; created_at: Date } | null> {
    const result = await this.database.query<{ id: string; created_at: Date }>(
      `
        SELECT id, created_at
        FROM messages
        WHERE id = $1
          AND conversation_id = $2
          AND workspace_id = $3
          AND owner_user_id = $4
        LIMIT 1
      `,
      [
        input.messageId,
        input.channelId,
        input.workspaceId,
        input.workspaceOwnerUserId
      ]
    );

    return result.rows[0] ?? null;
  }

  async markRead(input: {
    channelId: string;
    lastReadAt: Date | null;
    lastReadMessageId: string | null;
    userId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<void> {
    await this.database.query(
      `
        UPDATE channel_user_memberships
        SET last_read_at = COALESCE(
              (
                SELECT messages.created_at
                FROM messages
                WHERE messages.id = $5
                  AND messages.workspace_id = $2
                  AND messages.owner_user_id = $1
                  AND messages.conversation_id = $3
                LIMIT 1
              ),
              now()
            ),
            last_read_message_id = $5,
            updated_at = now()
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND channel_id = $3
          AND user_id = $4
          AND status = 'active'
          AND removed_at IS NULL
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.userId,
        input.lastReadMessageId
      ]
    );
  }

  async updateNotificationPreference(input: {
    channelId: string;
    notificationPreference: "all" | "mentions_only" | "muted";
    userId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<void> {
    await this.database.query(
      `
        UPDATE channel_user_memberships
        SET notification_preference = $5,
            updated_at = now()
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND channel_id = $3
          AND user_id = $4
          AND status = 'active'
          AND removed_at IS NULL
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.userId,
        input.notificationPreference
      ]
    );
  }

  async getReadState(input: {
    channelId: string;
    userId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<ChannelReadStateRow> {
    const result = await this.database.query<ChannelReadStateRow>(
      `
        WITH actor_membership AS (
          SELECT
            last_read_at,
            last_read_message_id,
            notification_preference
          FROM channel_user_memberships
          WHERE workspace_owner_user_id = $1
            AND workspace_id = $2
            AND channel_id = $3
            AND user_id = $4
            AND status = 'active'
            AND removed_at IS NULL
          LIMIT 1
        )
        SELECT
          actor_membership.last_read_at,
          actor_membership.last_read_message_id,
          COALESCE(actor_membership.notification_preference, 'all') AS notification_preference,
          COUNT(messages.id)::int AS unread_count
        FROM actor_membership
        LEFT JOIN messages
          ON messages.conversation_id = $3
          AND messages.workspace_id = $2
          AND messages.owner_user_id = $1
          AND messages.thread_parent_message_id IS NULL
          AND messages.author_user_id IS DISTINCT FROM $4
          AND (
            actor_membership.last_read_at IS NULL
            OR messages.created_at > actor_membership.last_read_at
          )
          AND actor_membership.notification_preference <> 'muted'
          AND (
            actor_membership.notification_preference = 'all'
            OR (
              actor_membership.notification_preference = 'mentions_only'
              AND messages.mentioned_user_ids @> jsonb_build_array(CAST($4 AS text))
            )
          )
        GROUP BY
          actor_membership.last_read_at,
          actor_membership.last_read_message_id,
          actor_membership.notification_preference
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.userId
      ]
    );

    return (
      result.rows[0] ?? {
        last_read_at: null,
        last_read_message_id: null,
        notification_preference: "all",
        unread_count: 0
      }
    );
  }

  async upsertPendingEmailMember(input: {
    channelId: string;
    invitedByUserId: string;
    invitedEmail: string;
    permission: "comment" | "read";
    workspaceId: string;
    workspaceInvitationId: string;
    workspaceOwnerUserId: string;
  }): Promise<void> {
    const updated = await this.database.query(
      `
        UPDATE channel_user_memberships
        SET permission = $5,
            workspace_invitation_id = $6,
            status = 'pending',
            updated_at = now()
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND channel_id = $3
          AND lower(invited_email) = $4
          AND invited_email IS NOT NULL
          AND removed_at IS NULL
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.invitedEmail.trim().toLowerCase(),
        input.permission,
        input.workspaceInvitationId
      ]
    );

    if ((updated.rowCount ?? 0) > 0) {
      return;
    }

    await this.database.query(
      `
        INSERT INTO channel_user_memberships (
          id,
          channel_id,
          workspace_id,
          workspace_owner_user_id,
          invited_email,
          workspace_invitation_id,
          role,
          permission,
          status,
          invited_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'member', $7, 'pending', $8)
      `,
      [
        randomUUID(),
        input.channelId,
        input.workspaceId,
        input.workspaceOwnerUserId,
        input.invitedEmail.trim().toLowerCase(),
        input.workspaceInvitationId,
        input.permission,
        input.invitedByUserId
      ]
    );
  }

  async updateHumanMemberPermission(input: {
    channelId: string;
    memberUserId: string;
    permission: "comment" | "read";
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE channel_user_memberships
        SET permission = $5,
            updated_at = now()
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND channel_id = $3
          AND user_id = $4
          AND role <> 'owner'
          AND status = 'active'
          AND removed_at IS NULL
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.memberUserId,
        input.permission
      ]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async removeHumanMemberByUserId(input: {
    channelId: string;
    memberUserId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE channel_user_memberships
        SET status = 'removed',
            removed_at = now(),
            updated_at = now()
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND channel_id = $3
          AND user_id = $4
          AND role <> 'owner'
          AND removed_at IS NULL
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.memberUserId
      ]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async removePendingHumanMemberById(input: {
    channelId: string;
    pendingMemberId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE channel_user_memberships
        SET status = 'removed',
            removed_at = now(),
            updated_at = now()
        WHERE workspace_owner_user_id = $1
          AND workspace_id = $2
          AND channel_id = $3
          AND id = $4
          AND user_id IS NULL
          AND removed_at IS NULL
      `,
      [
        input.workspaceOwnerUserId,
        input.workspaceId,
        input.channelId,
        input.pendingMemberId
      ]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async removeAiMember(input: {
    channelId: string;
    teammateId: string;
    workspaceId: string;
  }): Promise<boolean> {
    const result = await this.database.query(
      `
        DELETE FROM conversation_agents
        WHERE workspace_id = $1
          AND conversation_id = $2
          AND agent_id = $3
      `,
      [input.workspaceId, input.channelId, input.teammateId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async syncConversationModeToAiCount(input: {
    channelId: string;
    workspaceId: string;
    workspaceOwnerUserId: string;
  }): Promise<void> {
    await this.database.query(
      `
        UPDATE conversations
        SET mode = CASE
              WHEN (
                SELECT count(*)
                FROM conversation_agents
                WHERE conversation_agents.workspace_id = conversations.workspace_id
                  AND conversation_agents.conversation_id = conversations.id
              ) > 1 THEN 'group'::conversation_mode
              ELSE 'direct'::conversation_mode
            END,
            updated_at = now()
        WHERE id = $1
          AND workspace_id = $2
          AND owner_user_id = $3
      `,
      [input.channelId, input.workspaceId, input.workspaceOwnerUserId]
    );
  }
}
