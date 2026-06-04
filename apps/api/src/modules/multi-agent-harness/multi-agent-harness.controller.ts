import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { AuthService } from "../auth/auth.service.js";
import { MultiAgentHarnessService } from "./multi-agent-harness.service.js";

@Controller("channels")
export class MultiAgentHarnessController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(MultiAgentHarnessService)
    private readonly harnessService: MultiAgentHarnessService
  ) {}

  @Get(":channelId/events")
  async listEvents(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.harnessService.listEvents({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":channelId/participants")
  async listParticipants(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.harnessService.listParticipants({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":channelId/turns")
  async listTurns(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.harnessService.listTurns({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":channelId/agent-runs")
  async listAgentRuns(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.harnessService.listAgentRuns({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":channelId/handoffs")
  async listHandoffs(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.harnessService.listHandoffs({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":channelId/context-snapshots")
  async listContextSnapshots(
    @Param("channelId") channelId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.harnessService.listContextSnapshots({
      actorUserId: user.id,
      channelId,
      workspaceId: parsedWorkspaceId
    });
  }
}
