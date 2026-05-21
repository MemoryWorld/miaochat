import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { ConversationsService } from "./conversations.service.js";

@Controller("conversations")
export class ConversationsController {
  constructor(
    @Inject(ConversationsService)
    private readonly conversationsService: ConversationsService
  ) {}

  @Post()
  create(@Body() input: unknown) {
    return this.conversationsService.create(input);
  }

  @Get()
  list(@Query("workspaceId") workspaceId?: string) {
    return this.conversationsService.list(
      workspaceIdSchema.parse(workspaceId ?? "default-workspace")
    );
  }
}
