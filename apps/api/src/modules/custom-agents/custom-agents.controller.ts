import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { CustomAgentsService } from "./custom-agents.service.js";

@Controller("custom-agents")
export class CustomAgentsController {
  constructor(
    @Inject(CustomAgentsService)
    private readonly customAgentsService: CustomAgentsService
  ) {}

  @Post()
  create(@Body() input: unknown) {
    return this.customAgentsService.create(input);
  }

  @Get()
  list(@Query("workspaceId") workspaceId?: string) {
    return this.customAgentsService.list(
      workspaceIdSchema.parse(workspaceId ?? "default-workspace")
    );
  }
}
