import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { CodingWorkflowsService } from "./coding-workflows.service.js";

@Controller("coding-workflows")
export class CodingWorkflowsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(CodingWorkflowsService)
    private readonly codingWorkflowsService: CodingWorkflowsService,
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
    await this.permissionGuard.assert(user.id, workspaceId, "conversation.create");
    return this.codingWorkflowsService.create(input, user.id);
  }

  @Get()
  async get(
    @Query("conversationId") conversationId: string | undefined,
    @Query("id") id: string | undefined,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "conversation.read");
    return this.codingWorkflowsService.get(
      {
        conversationId,
        id,
        workspaceId: parsedWorkspaceId
      },
      user.id
    );
  }

  @Post(":workflowId/decisions")
  @HttpCode(200)
  async decide(
    @Param("workflowId") workflowId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId = workspaceIdSchema.parse(
      input && typeof input === "object"
        ? (input as { workspaceId?: string }).workspaceId ?? "default-workspace"
        : "default-workspace"
    );
    await this.permissionGuard.assert(user.id, workspaceId, "conversation.update");
    return this.codingWorkflowsService.decide(workflowId, input, user.id);
  }
}
