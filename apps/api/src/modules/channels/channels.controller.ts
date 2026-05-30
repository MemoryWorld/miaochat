import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { AuthService } from "../auth/auth.service.js";
import { ChannelMembersService } from "./channel-members.service.js";

@Controller("channels")
export class ChannelsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ChannelMembersService)
    private readonly channelMembersService: ChannelMembersService
  ) {}

  @Get(":channelId/members")
  async listMembers(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.channelMembersService.listMembers({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Post(":channelId/members/humans")
  async addHumanMembers(
    @Param("channelId") channelId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.channelMembersService.addHumanMembers({
      actorUserId: user.id,
      channelId,
      rawInput: input
    });
  }

  @Get(":channelId/read-state")
  async getReadState(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.channelMembersService.getReadState({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Post(":channelId/read-state")
  @HttpCode(200)
  async markRead(
    @Param("channelId") channelId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.channelMembersService.markRead({
      actorUserId: user.id,
      channelId,
      rawInput: input
    });
  }

  @Patch(":channelId/notification-preference")
  async updateNotificationPreference(
    @Param("channelId") channelId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.channelMembersService.updateNotificationPreference({
      actorUserId: user.id,
      channelId,
      rawInput: input
    });
  }

  @Patch(":channelId/members/:memberId")
  async updateMember(
    @Param("channelId") channelId: string,
    @Param("memberId") memberId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.channelMembersService.updateHumanMember({
      actorUserId: user.id,
      channelId,
      memberId,
      rawInput: input
    });
  }

  @Delete(":channelId/members/:memberId")
  @HttpCode(200)
  async removeMember(
    @Param("channelId") channelId: string,
    @Param("memberId") memberId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.channelMembersService.removeMember({
      actorUserId: user.id,
      channelId,
      memberId,
      workspaceId: parsedWorkspaceId
    });
  }
}
