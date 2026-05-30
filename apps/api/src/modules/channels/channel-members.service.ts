import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  addHumanChannelMembersInputSchema,
  channelReadStateSchema,
  channelMemberListSchema,
  markChannelReadInputSchema,
  updateHumanChannelMemberInputSchema,
  updateChannelNotificationPreferenceInputSchema,
  type ChannelReadState,
  type ChannelMemberList,
  type HumanChannelMember
} from "@agenthub/contracts";

import { WorkspaceAuditService } from "../workspaces/audit.service.js";
import { WorkspaceInvitationsService } from "../workspaces/invitations.service.js";
import { WorkspaceMembershipsService } from "../workspaces/memberships.service.js";
import {
  ChannelMembersRepository,
  type ChannelConversationRow,
  type ChannelHumanMemberRow
} from "./channel-members.repository.js";

export type ChannelAccess = {
  channelId: string;
  ownerUserId: string;
  permission: "comment" | "manage" | "read";
  workspaceId: string;
};

@Injectable()
export class ChannelMembersService {
  constructor(
    @Inject(WorkspaceAuditService) private readonly audit: WorkspaceAuditService,
    @Inject(ChannelMembersRepository)
    private readonly channelMembersRepository: ChannelMembersRepository,
    @Inject(WorkspaceInvitationsService)
    private readonly invitations: WorkspaceInvitationsService,
    @Inject(WorkspaceMembershipsService)
    private readonly memberships: WorkspaceMembershipsService
  ) {}

  async listMembers(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<ChannelMemberList> {
    const access = await this.assertCanRead(input);
    const [channel, humanRows, aiRows] = await Promise.all([
      this.loadChannel(input.channelId, input.workspaceId),
      this.channelMembersRepository.listHumanMembers({
        channelId: input.channelId,
        workspaceId: input.workspaceId,
        workspaceOwnerUserId: access.ownerUserId
      }),
      this.channelMembersRepository.listAiMembers({
        channelId: input.channelId,
        workspaceId: input.workspaceId
      })
    ]);
    const ownerFallback = await this.buildOwnerFallback(channel, humanRows);
    const humanMembers = ownerFallback
      ? [ownerFallback, ...humanRows.map(mapHumanRow)]
      : humanRows.map(mapHumanRow);
    const aiMembers = aiRows.map((row) => ({
      avatarUrl: row.avatar_url,
      displayName: row.agent_name,
      joinedAt: row.created_at,
      kind: "ai" as const,
      lastActiveAt: null,
      memberId: `ai:${row.agent_id}`,
      permission: "comment" as const,
      role: "ai_teammate" as const,
      status: "available" as const,
      teammateId: row.agent_id
    }));
    const members = [...humanMembers, ...aiMembers];

    return channelMemberListSchema.parse({
      aiCount: aiMembers.length,
      channelId: input.channelId,
      humanCount: humanMembers.length,
      members,
      totalCount: members.length,
      workspaceId: input.workspaceId
    });
  }

  async addHumanMembers(input: {
    actorUserId: string;
    channelId: string;
    rawInput: unknown;
  }): Promise<ChannelMemberList> {
    const parsed = addHumanChannelMembersInputSchema.parse(input.rawInput);
    const access = await this.assertCanManage({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });

    for (const userId of new Set(parsed.userIds)) {
      const isWorkspaceMember = await this.memberships.isMember(
        access.ownerUserId,
        parsed.workspaceId,
        userId
      );

      if (!isWorkspaceMember) {
        throw new BadRequestException("只能邀请当前工作区里的真实同事。");
      }

      await this.channelMembersRepository.upsertActiveHumanMember({
        channelId: input.channelId,
        invitedByUserId: input.actorUserId,
        permission: parsed.permission,
        userId,
        workspaceId: parsed.workspaceId,
        workspaceOwnerUserId: access.ownerUserId
      });
    }

    for (const email of new Set(parsed.emails.map((entry) => entry.trim().toLowerCase()))) {
      const existingWorkspaceUser =
        await this.channelMembersRepository.findWorkspaceUserByEmail({
          email,
          workspaceId: parsed.workspaceId,
          workspaceOwnerUserId: access.ownerUserId
        });

      if (existingWorkspaceUser) {
        await this.channelMembersRepository.upsertActiveHumanMember({
          channelId: input.channelId,
          invitedByUserId: input.actorUserId,
          permission: parsed.permission,
          userId: existingWorkspaceUser.id,
          workspaceId: parsed.workspaceId,
          workspaceOwnerUserId: access.ownerUserId
        });
        continue;
      }

      if (input.actorUserId !== access.ownerUserId) {
        throw new ForbiddenException("只有频道所有者可以邀请工作区外的新同事。");
      }

      const existingInvitation =
        await this.channelMembersRepository.findPendingWorkspaceInvitationByEmail({
          email,
          workspaceId: parsed.workspaceId,
          workspaceOwnerUserId: access.ownerUserId
        });
      const invitationId = existingInvitation
        ? existingInvitation.id
        : (
            await this.invitations.invite(access.ownerUserId, parsed.workspaceId, {
              invitedEmail: email,
              role: "member"
            })
          ).invitation.id;

      await this.channelMembersRepository.upsertPendingEmailMember({
        channelId: input.channelId,
        invitedByUserId: input.actorUserId,
        invitedEmail: email,
        permission: parsed.permission,
        workspaceId: parsed.workspaceId,
        workspaceInvitationId: invitationId,
        workspaceOwnerUserId: access.ownerUserId
      });
    }

    await this.audit.append({
      action: "channel.member.add",
      actorUserId: input.actorUserId,
      details: {
        emails: parsed.emails,
        permission: parsed.permission,
        userIds: parsed.userIds
      },
      resourceId: input.channelId,
      resourceType: "channel",
      workspaceId: parsed.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });

    return this.listMembers({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });
  }

  async updateHumanMember(input: {
    actorUserId: string;
    channelId: string;
    memberId: string;
    rawInput: unknown;
  }): Promise<ChannelMemberList> {
    const parsed = updateHumanChannelMemberInputSchema.parse(input.rawInput);
    const access = await this.assertCanManage({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });
    const member = parseChannelMemberId(input.memberId);

    if (member.kind !== "human" || member.userId === null) {
      throw new BadRequestException("只能调整已加入同事的频道权限。");
    }

    if (member.userId === access.ownerUserId) {
      throw new BadRequestException("频道所有者的管理权限不能被降级。");
    }

    const updated = await this.channelMembersRepository.updateHumanMemberPermission({
      channelId: input.channelId,
      memberUserId: member.userId,
      permission: parsed.permission,
      workspaceId: parsed.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });

    if (!updated) {
      throw new NotFoundException("要调整的频道成员不存在或已不可用。");
    }

    await this.audit.append({
      action: "channel.member.update",
      actorUserId: input.actorUserId,
      details: {
        memberId: input.memberId,
        permission: parsed.permission
      },
      resourceId: input.channelId,
      resourceType: "channel",
      workspaceId: parsed.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });

    return this.listMembers({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });
  }

  async removeMember(input: {
    actorUserId: string;
    channelId: string;
    memberId: string;
    workspaceId: string;
  }): Promise<ChannelMemberList> {
    const access = await this.assertCanManage(input);
    const member = parseChannelMemberId(input.memberId);
    let removed = false;

    if (member.kind === "human") {
      if (member.userId === access.ownerUserId) {
        throw new BadRequestException("频道所有者不能从频道移除。");
      }

      if (member.userId) {
        removed = await this.channelMembersRepository.removeHumanMemberByUserId({
          channelId: input.channelId,
          memberUserId: member.userId,
          workspaceId: input.workspaceId,
          workspaceOwnerUserId: access.ownerUserId
        });
      } else {
        const pendingId = member.pendingId;

        if (!pendingId) {
          throw new BadRequestException("频道成员标识无效。");
        }

        removed = await this.channelMembersRepository.removePendingHumanMemberById({
          channelId: input.channelId,
          pendingMemberId: pendingId,
          workspaceId: input.workspaceId,
          workspaceOwnerUserId: access.ownerUserId
        });
      }
    } else {
      removed = await this.channelMembersRepository.removeAiMember({
        channelId: input.channelId,
        teammateId: member.teammateId,
        workspaceId: input.workspaceId
      });

      if (removed) {
        await this.channelMembersRepository.syncConversationModeToAiCount({
          channelId: input.channelId,
          workspaceId: input.workspaceId,
          workspaceOwnerUserId: access.ownerUserId
        });
      }
    }

    if (!removed) {
      throw new NotFoundException("要移除的频道成员不存在或已不可用。");
    }

    await this.audit.append({
      action: "channel.member.remove",
      actorUserId: input.actorUserId,
      details: {
        memberId: input.memberId
      },
      resourceId: input.channelId,
      resourceType: "channel",
      workspaceId: input.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });

    return this.listMembers({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: input.workspaceId
    });
  }

  async getReadState(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<ChannelReadState> {
    const access = await this.assertCanRead(input);
    await this.ensureActorMembership(input.actorUserId, access);
    const state = await this.channelMembersRepository.getReadState({
      channelId: input.channelId,
      userId: input.actorUserId,
      workspaceId: input.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });

    return channelReadStateSchema.parse({
      channelId: input.channelId,
      lastReadAt: state.last_read_at,
      lastReadMessageId: state.last_read_message_id,
      notificationPreference: state.notification_preference,
      unreadCount: state.unread_count,
      workspaceId: input.workspaceId
    });
  }

  async markRead(input: {
    actorUserId: string;
    channelId: string;
    rawInput: unknown;
  }): Promise<ChannelReadState> {
    const parsed = markChannelReadInputSchema.parse(input.rawInput);
    const access = await this.assertCanRead({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });
    await this.ensureActorMembership(input.actorUserId, access);
    const lastReadMessage = parsed.lastReadMessageId
      ? await this.channelMembersRepository.findMessageInChannel({
          channelId: input.channelId,
          messageId: parsed.lastReadMessageId,
          workspaceId: parsed.workspaceId,
          workspaceOwnerUserId: access.ownerUserId
        })
      : null;

    if (parsed.lastReadMessageId && !lastReadMessage) {
      throw new BadRequestException("要标记已读的消息不在当前频道里。");
    }

    await this.channelMembersRepository.markRead({
      channelId: input.channelId,
      lastReadAt: lastReadMessage?.created_at ?? null,
      lastReadMessageId: parsed.lastReadMessageId,
      userId: input.actorUserId,
      workspaceId: parsed.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });

    return this.getReadState({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });
  }

  async updateNotificationPreference(input: {
    actorUserId: string;
    channelId: string;
    rawInput: unknown;
  }): Promise<ChannelReadState> {
    const parsed = updateChannelNotificationPreferenceInputSchema.parse(input.rawInput);
    const access = await this.assertCanRead({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });
    await this.ensureActorMembership(input.actorUserId, access);

    await this.channelMembersRepository.updateNotificationPreference({
      channelId: input.channelId,
      notificationPreference: parsed.notificationPreference,
      userId: input.actorUserId,
      workspaceId: parsed.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });
    await this.audit.append({
      action: "channel.notification.update",
      actorUserId: input.actorUserId,
      details: {
        notificationPreference: parsed.notificationPreference
      },
      resourceId: input.channelId,
      resourceType: "channel",
      workspaceId: parsed.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });

    return this.getReadState({
      actorUserId: input.actorUserId,
      channelId: input.channelId,
      workspaceId: parsed.workspaceId
    });
  }

  async assertCanRead(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<ChannelAccess> {
    const channel = await this.loadChannel(input.channelId, input.workspaceId);

    if (channel.owner_user_id === input.actorUserId) {
      return {
        channelId: channel.id,
        ownerUserId: channel.owner_user_id,
        permission: "manage",
        workspaceId: channel.workspace_id
      };
    }

    const membership = await this.channelMembersRepository.findActiveHumanMembership({
      channelId: channel.id,
      userId: input.actorUserId,
      workspaceId: channel.workspace_id,
      workspaceOwnerUserId: channel.owner_user_id
    });

    if (!membership) {
      throw new ForbiddenException("你还不是这个频道的成员。");
    }

    return {
      channelId: channel.id,
      ownerUserId: channel.owner_user_id,
      permission: membership.permission,
      workspaceId: channel.workspace_id
    };
  }

  async assertCanSend(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<ChannelAccess> {
    const access = await this.assertCanRead(input);

    if (access.permission === "read") {
      throw new ForbiddenException("你在这个频道里只有只读权限，不能发言。");
    }

    return access;
  }

  async assertCanManage(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<ChannelAccess> {
    const access = await this.assertCanRead(input);

    if (access.permission !== "manage") {
      throw new ForbiddenException("你没有管理这个频道成员的权限。");
    }

    return access;
  }

  async wasRemovedHumanMember(input: {
    actorUserId: string;
    channelId: string;
    workspaceId: string;
  }): Promise<boolean> {
    const channel = await this.loadChannel(input.channelId, input.workspaceId);

    if (channel.owner_user_id === input.actorUserId) {
      return false;
    }

    const membership = await this.channelMembersRepository.findHumanMembership({
      channelId: channel.id,
      userId: input.actorUserId,
      workspaceId: channel.workspace_id,
      workspaceOwnerUserId: channel.owner_user_id
    });

    return membership?.status === "removed";
  }

  async resolveMentionedUserIds(input: {
    actorUserId: string;
    channelId: string;
    mentionedUserIds: string[];
    workspaceId: string;
  }): Promise<string[]> {
    if (input.mentionedUserIds.length === 0) {
      return [];
    }

    const access = await this.assertCanRead(input);
    const mentionedUserIds = [...new Set(input.mentionedUserIds)];
    const invalidUserIds: string[] = [];

    for (const userId of mentionedUserIds) {
      if (userId === access.ownerUserId) {
        continue;
      }

      const membership = await this.channelMembersRepository.findActiveHumanMembership({
        channelId: input.channelId,
        userId,
        workspaceId: input.workspaceId,
        workspaceOwnerUserId: access.ownerUserId
      });

      if (!membership) {
        invalidUserIds.push(userId);
      }
    }

    if (invalidUserIds.length > 0) {
      throw new BadRequestException("提到的同事必须已经在当前频道里。");
    }

    return mentionedUserIds;
  }

  private async loadChannel(
    channelId: string,
    workspaceId: string
  ): Promise<ChannelConversationRow> {
    const channel = await this.channelMembersRepository.findChannel(channelId, workspaceId);

    if (!channel) {
      throw new NotFoundException("频道不存在或已不可用。");
    }

    return channel;
  }

  private async buildOwnerFallback(
    channel: ChannelConversationRow,
    humanRows: ChannelHumanMemberRow[]
  ): Promise<HumanChannelMember | null> {
    if (humanRows.some((row) => row.user_id === channel.owner_user_id)) {
      return null;
    }

    const owner = await this.channelMembersRepository.findUser(channel.owner_user_id);

    return {
      avatarUrl: null,
      displayName: owner?.display_name ?? "频道所有者",
      joinedAt: null,
      kind: "human",
      lastActiveAt: null,
      memberId: `human:${channel.owner_user_id}`,
      permission: "manage",
      role: "owner",
      status: "active",
      userId: channel.owner_user_id
    };
  }

  private async ensureActorMembership(
    actorUserId: string,
    access: ChannelAccess
  ): Promise<void> {
    if (actorUserId !== access.ownerUserId) {
      return;
    }

    await this.channelMembersRepository.ensureOwnerMembership({
      channelId: access.channelId,
      workspaceId: access.workspaceId,
      workspaceOwnerUserId: access.ownerUserId
    });
  }
}

function mapHumanRow(row: ChannelHumanMemberRow): HumanChannelMember {
  return {
    avatarUrl: null,
    displayName: row.display_name ?? row.invited_email ?? "待加入同事",
    joinedAt: row.joined_at,
    kind: "human",
    lastActiveAt: row.last_active_at,
    memberId: row.user_id ? `human:${row.user_id}` : `human:pending:${row.id}`,
    permission: row.permission,
    role: row.role,
    status: row.status === "removed" ? "disabled" : row.status,
    userId: row.user_id
  };
}

function parseChannelMemberId(rawMemberId: string):
  | {
      kind: "ai";
      teammateId: string;
    }
  | {
      kind: "human";
      pendingId: string;
      userId: null;
    }
  | {
      kind: "human";
      pendingId: null;
      userId: string;
    } {
  if (rawMemberId.startsWith("ai:")) {
    const teammateId = rawMemberId.slice("ai:".length);

    if (!teammateId) {
      throw new BadRequestException("频道成员标识无效。");
    }

    return {
      kind: "ai",
      teammateId
    };
  }

  if (rawMemberId.startsWith("human:pending:")) {
    const pendingId = rawMemberId.slice("human:pending:".length);

    if (!pendingId) {
      throw new BadRequestException("频道成员标识无效。");
    }

    return {
      kind: "human",
      pendingId,
      userId: null
    };
  }

  if (rawMemberId.startsWith("human:")) {
    const userId = rawMemberId.slice("human:".length);

    if (!userId) {
      throw new BadRequestException("频道成员标识无效。");
    }

    return {
      kind: "human",
      pendingId: null,
      userId
    };
  }

  throw new BadRequestException("频道成员标识无效。");
}
