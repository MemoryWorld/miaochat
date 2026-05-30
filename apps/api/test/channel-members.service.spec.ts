import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ChannelMembersService } from "../src/modules/channels/channel-members.service.js";

function createService(overrides: Partial<{
  audit: Record<string, unknown>;
  invitations: Record<string, unknown>;
  memberships: Record<string, unknown>;
  repository: Record<string, unknown>;
}> = {}) {
  const repository = {
    findActiveHumanMembership: vi.fn(),
    findChannel: vi.fn().mockResolvedValue({
      id: "channel_1",
      owner_user_id: "user_owner",
      title: "编码频道",
      workspace_id: "workspace_1"
    }),
    findPendingWorkspaceInvitationByEmail: vi.fn().mockResolvedValue(null),
    findUser: vi.fn().mockResolvedValue({
      display_name: "频道所有者",
      email: "owner@example.com",
      id: "user_owner"
    }),
    findWorkspaceUserByEmail: vi.fn().mockResolvedValue(null),
    listAiMembers: vi.fn().mockResolvedValue([]),
    listHumanMembers: vi.fn().mockResolvedValue([]),
    removeAiMember: vi.fn().mockResolvedValue(false),
    removeHumanMemberByUserId: vi.fn().mockResolvedValue(false),
    removePendingHumanMemberById: vi.fn().mockResolvedValue(false),
    syncConversationModeToAiCount: vi.fn().mockResolvedValue(undefined),
    updateHumanMemberPermission: vi.fn().mockResolvedValue(false),
    upsertActiveHumanMember: vi.fn().mockResolvedValue(undefined),
    upsertPendingEmailMember: vi.fn().mockResolvedValue(undefined),
    ...overrides.repository
  };
  const audit = {
    append: vi.fn().mockResolvedValue(undefined),
    ...overrides.audit
  };
  const invitations = {
    invite: vi.fn().mockResolvedValue({
      invitation: { id: "invite_1" },
      token: "token"
    }),
    ...overrides.invitations
  };
  const memberships = {
    isMember: vi.fn().mockResolvedValue(true),
    ...overrides.memberships
  };

  return {
    audit,
    invitations,
    memberships,
    repository,
    service: new ChannelMembersService(
      audit as never,
      repository as never,
      invitations as never,
      memberships as never
    )
  };
}

describe("ChannelMembersService", () => {
  it("lists the owner fallback and active AI coworkers in one roster", async () => {
    const { service } = createService({
      repository: {
        listAiMembers: vi.fn().mockResolvedValue([
          {
            agent_id: "agent_engineer",
            agent_name: "软件工程师",
            avatar_url: null,
            created_at: new Date("2026-05-30T00:00:00.000Z")
          }
        ])
      }
    });

    const roster = await service.listMembers({
      actorUserId: "user_owner",
      channelId: "channel_1",
      workspaceId: "workspace_1"
    });

    expect(roster.totalCount).toBe(2);
    expect(roster.members.map((member) => member.displayName)).toEqual([
      "频道所有者",
      "软件工程师"
    ]);
  });

  it("blocks read-only human members from sending messages", async () => {
    const { service } = createService({
      repository: {
        findActiveHumanMembership: vi.fn().mockResolvedValue({
          permission: "read"
        })
      }
    });

    await expect(
      service.assertCanSend({
        actorUserId: "user_reader",
        channelId: "channel_1",
        workspaceId: "workspace_1"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("adds an existing workspace user and records a channel audit event", async () => {
    const { audit, repository, service } = createService();

    await service.addHumanMembers({
      actorUserId: "user_owner",
      channelId: "channel_1",
      rawInput: {
        permission: "comment",
        userIds: ["user_member"],
        workspaceId: "workspace_1"
      }
    });

    expect(repository.upsertActiveHumanMember).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "channel_1",
        permission: "comment",
        userId: "user_member",
        workspaceOwnerUserId: "user_owner"
      })
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "channel.member.add",
        resourceId: "channel_1"
      })
    );
  });

  it("rejects attempts to remove the channel owner", async () => {
    const { service } = createService();

    await expect(
      service.removeMember({
        actorUserId: "user_owner",
        channelId: "channel_1",
        memberId: "human:user_owner",
        workspaceId: "workspace_1"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("removes an AI coworker and recalculates channel mode", async () => {
    const { audit, repository, service } = createService({
      repository: {
        removeAiMember: vi.fn().mockResolvedValue(true)
      }
    });

    await service.removeMember({
      actorUserId: "user_owner",
      channelId: "channel_1",
      memberId: "ai:agent_engineer",
      workspaceId: "workspace_1"
    });

    expect(repository.removeAiMember).toHaveBeenCalledWith({
      channelId: "channel_1",
      teammateId: "agent_engineer",
      workspaceId: "workspace_1"
    });
    expect(repository.syncConversationModeToAiCount).toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "channel.member.remove"
      })
    );
  });
});
