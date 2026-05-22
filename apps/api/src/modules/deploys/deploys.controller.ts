import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";

import { deployCommandInputSchema, workspaceIdSchema } from "@agenthub/contracts";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { DeployDispatchService } from "./dispatch.service.js";
import { PreviewUrlService } from "./preview-url.service.js";

@Controller("deploys")
export class DeploysController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard,
    @Inject(DeployDispatchService)
    private readonly deployDispatchService: DeployDispatchService,
    @Inject(PreviewUrlService)
    private readonly previewUrlService: PreviewUrlService
  ) {}

  @Post()
  async create(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = deployCommandInputSchema.parse(input ?? {});
    await this.permissionGuard.assert(user.id, workspaceId, "deploy_target.manage");
    return this.deployDispatchService.dispatch(input, user.id);
  }

  @Post(":deploymentId/preview-url/revoke")
  @HttpCode(200)
  async revokePreviewUrl(
    @Param("deploymentId") deploymentId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "deploy_target.manage");
    return this.previewUrlService.rotatePreviewUrl(
      deploymentId,
      parsedWorkspaceId,
      user.id
    );
  }
}
