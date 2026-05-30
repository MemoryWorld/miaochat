import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query
} from "@nestjs/common";
import { z } from "zod";

import { workspaceIdSchema } from "@agenthub/contracts";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { WorkspaceShellService } from "./workspace-shell.service.js";

const workspaceQuerySchema = z.object({
  channelId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  teammateId: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

@Controller()
export class WorkspaceShellController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard,
    @Inject(WorkspaceShellService)
    private readonly workspaceShellService: WorkspaceShellService
  ) {}

  @Get("channels")
  async listChannels(
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("teammateId") teammateId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse({
      teammateId,
      workspaceId
    });
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "conversation.read");
    return this.workspaceShellService.listChannels(user.id, parsed.workspaceId, parsed.teammateId);
  }

  @Get("channel-files")
  async listChannelFiles(
    @Query("channelId") channelId: string | undefined,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse({
      channelId,
      workspaceId
    });
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "artifact.read");
    return this.workspaceShellService.listChannelFiles(
      user.id,
      parsed.workspaceId,
      requireQueryValue(parsed.channelId, "channelId")
    );
  }

  @Get("actor-files")
  async listActorFiles(
    @Query("teammateId") teammateId: string | undefined,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse({
      teammateId,
      workspaceId
    });
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "artifact.read");
    return this.workspaceShellService.listActorFiles(
      user.id,
      parsed.workspaceId,
      requireQueryValue(parsed.teammateId, "teammateId")
    );
  }

  @Get("inbox")
  async listInbox(
    @Query("teammateId") teammateId: string | undefined,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse({
      teammateId,
      workspaceId
    });
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "message.read");
    return this.workspaceShellService.listInboxItems({
      ownerUserId: user.id,
      teammateId: parsed.teammateId,
      workspaceId: parsed.workspaceId
    });
  }

  @Get("tasks")
  async listTasks(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse(query);
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "message.read");
    return this.workspaceShellService.listTasks({
      channelId: parsed.channelId,
      ownerUserId: user.id,
      teammateId: parsed.teammateId,
      workflowId: parsed.workflowId,
      workspaceId: parsed.workspaceId
    });
  }

  @Get("calendar")
  async listCalendar(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse(query);
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "message.read");
    return this.workspaceShellService.listCalendarEvents({
      channelId: parsed.channelId,
      ownerUserId: user.id,
      teammateId: parsed.teammateId,
      workspaceId: parsed.workspaceId
    });
  }

  @Get("activity")
  async listActivity(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse(query);
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "message.read");
    return this.workspaceShellService.listActivityRounds({
      channelId: parsed.channelId,
      conversationId: parsed.conversationId,
      ownerUserId: user.id,
      teammateId: parsed.teammateId,
      workflowId: parsed.workflowId,
      workspaceId: parsed.workspaceId
    });
  }

  @Get("approvals")
  async listApprovals(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse(query);
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "message.read");
    return this.workspaceShellService.listApprovalRequests({
      channelId: parsed.channelId,
      ownerUserId: user.id,
      teammateId: parsed.teammateId,
      workspaceId: parsed.workspaceId
    });
  }

  @Get("memory")
  async listMemory(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse(query);
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "message.read");
    return this.workspaceShellService.listMemoryRecords({
      conversationId: parsed.conversationId,
      ownerUserId: user.id,
      teammateId: parsed.teammateId,
      workspaceId: parsed.workspaceId
    });
  }

  @Post("memory")
  async createMemory(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId =
      input && typeof input === "object"
        ? workspaceIdSchema.parse(
            (input as { workspaceId?: string }).workspaceId ?? "default-workspace"
          )
        : "default-workspace";
    await this.permissionGuard.assert(user.id, workspaceId, "message.send");
    return this.workspaceShellService.createMemoryRecord(input, user.id);
  }

  @Get("skills")
  async listSkills(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse(query);
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "custom_agent.read");
    return this.workspaceShellService.listSkillBindings({
      ownerUserId: user.id,
      teammateId: parsed.teammateId,
      workspaceId: parsed.workspaceId
    });
  }

  @Get("workspace-member-directory")
  async listMemberDirectory(
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "custom_agent.read");
    return this.workspaceShellService.listMemberDirectory(user.id, parsedWorkspaceId);
  }

  @Get("workspace-billing-summary")
  async getBillingPlanSummary(
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "credential.read");
    return this.workspaceShellService.getBillingPlanSummary({
      ownerUserId: user.id,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get("workspace-capabilities")
  async listCapabilities(
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "custom_agent.read");
    return this.workspaceShellService.listCapabilities({
      ownerUserId: user.id,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get("actor-profile")
  async getActorProfile(
    @Query("teammateId") teammateId: string | undefined,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceQuerySchema.parse({
      teammateId,
      workspaceId
    });
    await this.permissionGuard.assert(user.id, parsed.workspaceId, "custom_agent.read");
    return this.workspaceShellService.getActorProfile(
      user.id,
      parsed.workspaceId,
      requireQueryValue(parsed.teammateId, "teammateId")
    );
  }
}

function requireQueryValue(value: string | undefined, fieldName: string): string {
  if (!value) {
    throw new BadRequestException(`Missing required query field: ${fieldName}`);
  }

  return value;
}
