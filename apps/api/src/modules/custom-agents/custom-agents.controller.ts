import { Body, Controller, Get, Headers, Inject, Post, Query } from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { CustomAgentsService } from "./custom-agents.service.js";

@Controller("custom-agents")
export class CustomAgentsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(CustomAgentsService)
    private readonly customAgentsService: CustomAgentsService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard
  ) {}

  @Post()
  async create(@Body() input: unknown, @Headers("cookie") cookieHeader: string | undefined) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId = workspaceIdSchema.parse(
      input && typeof input === "object"
        ? (input as { workspaceId?: string }).workspaceId ?? "default-workspace"
        : "default-workspace"
    );
    await this.permissionGuard.assert(user.id, workspaceId, "custom_agent.manage");
    return this.customAgentsService.create(input, user.id);
  }

  @Get()
  async list(
    @Query("workspaceId") workspaceId?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "custom_agent.read");
    return this.customAgentsService.list(parsed, user.id);
  }
}
