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
import { VisualWorkflowsService } from "./visual-workflows.service.js";

@Controller("visual-workflows")
export class VisualWorkflowsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(VisualWorkflowsService)
    private readonly visualWorkflowsService: VisualWorkflowsService
  ) {}

  @Get()
  async list(
    @Query("channelId") channelId: string | undefined,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.visualWorkflowsService.list(
      {
        channelId,
        workspaceId: workspaceId ?? "default-workspace"
      },
      user.id
    );
  }

  @Get(":workflowId/runs")
  async listRuns(
    @Param("workflowId") workflowId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.visualWorkflowsService.listRuns({
      actorUserId: user.id,
      workflowId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":workflowId")
  async get(
    @Param("workflowId") workflowId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");

    return this.visualWorkflowsService.get({
      actorUserId: user.id,
      workflowId,
      workspaceId: parsedWorkspaceId
    });
  }

  @Post(":workflowId/runs")
  @HttpCode(200)
  async execute(
    @Param("workflowId") workflowId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.visualWorkflowsService.execute(workflowId, input, user.id);
  }

  @Post(":workflowId/regenerate")
  @HttpCode(200)
  async regenerate(
    @Param("workflowId") workflowId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.visualWorkflowsService.regenerate(workflowId, input, user.id);
  }

  @Post(":workflowId/cancel")
  @HttpCode(200)
  async cancel(
    @Param("workflowId") workflowId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);

    return this.visualWorkflowsService.cancel(workflowId, input, user.id);
  }
}
