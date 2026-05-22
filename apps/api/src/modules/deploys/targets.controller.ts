import { Body, Controller, Get, Headers, Inject, Post, Query } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { defaultWorkspaceId } from "../workspaces/workspaces.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import type { DeployTargetCreateInput } from "./dto.js";
import { parseDeployTargetWorkspaceQuery } from "./dto.js";
import { DeployTargetsService } from "./targets.service.js";

@Controller("deploys/targets")
export class DeployTargetsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard,
    @Inject(DeployTargetsService)
    private readonly deployTargetsService: DeployTargetsService
  ) {}

  @Post()
  async create(
    @Body() input: DeployTargetCreateInput,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId =
      (input as { workspaceId?: string })?.workspaceId ?? defaultWorkspaceId;
    await this.permissionGuard.assert(user.id, workspaceId, "deploy_target.manage");
    return this.deployTargetsService.create(input, user.id);
  }

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = parseDeployTargetWorkspaceQuery(query);
    await this.permissionGuard.assert(user.id, workspaceId, "deploy_target.read");
    return this.deployTargetsService.list(workspaceId, user.id);
  }
}
