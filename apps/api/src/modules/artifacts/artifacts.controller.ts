import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { ArtifactsService } from "./artifacts.service.js";

@Controller("artifacts")
export class ArtifactsController {
  constructor(
    @Inject(ArtifactsService)
    private readonly artifactsService: ArtifactsService
  ) {}

  @Post()
  create(@Body() input: unknown) {
    return this.artifactsService.create(input);
  }

  @Get()
  list(
    @Query("messageId") messageId?: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.artifactsService.list({
      messageId,
      workspaceId: workspaceIdSchema.parse(workspaceId ?? "default-workspace")
    });
  }

  @Post("upload-target")
  prepareUploadTarget(@Body() input: unknown) {
    return this.artifactsService.prepareUploadTarget(input);
  }
}
