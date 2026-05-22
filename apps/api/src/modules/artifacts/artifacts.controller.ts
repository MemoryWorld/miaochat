import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { ArtifactsService } from "./artifacts.service.js";
import { ArtifactConflictDetectorService } from "./conflict-detector.service.js";
import { ArtifactRevisionsService } from "./revisions.service.js";

@Controller("artifacts")
export class ArtifactsController {
  constructor(
    @Inject(ArtifactsService)
    private readonly artifactsService: ArtifactsService,
    @Inject(ArtifactConflictDetectorService)
    private readonly conflictDetector: ArtifactConflictDetectorService,
    @Inject(ArtifactRevisionsService)
    private readonly revisionsService: ArtifactRevisionsService
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

  @Get(":artifactId/revisions")
  listRevisions(@Param("artifactId") artifactId: string) {
    return this.revisionsService.listForArtifact(artifactId);
  }

  @Post(":artifactId/revisions")
  appendRevision(
    @Param("artifactId") artifactId: string,
    @Body() input: unknown,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.revisionsService.append({
      artifactId,
      payload: input,
      workspaceId: workspaceIdSchema.parse(workspaceId ?? "default-workspace")
    });
  }

  @Get(":artifactId/revisions/:revisionIndex/diff")
  describeDiff(
    @Param("artifactId") artifactId: string,
    @Param("revisionIndex") revisionIndex: string
  ) {
    return this.revisionsService.describeDiff(
      artifactId,
      Number.parseInt(revisionIndex, 10)
    );
  }

  @Get(":artifactId/conflicts")
  detectConflict(@Param("artifactId") artifactId: string) {
    return this.conflictDetector.detect(artifactId);
  }
}
