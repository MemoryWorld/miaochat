import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";
import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { ArtifactsService } from "./artifacts.service.js";
import { ArtifactConflictDetectorService } from "./conflict-detector.service.js";
import { ArtifactRevisionsService } from "./revisions.service.js";

const artifactWorkspaceInputSchema = z
  .object({ workspaceId: z.string().min(1).default("default-workspace") })
  .passthrough();

@Controller("artifacts")
export class ArtifactsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ArtifactsService)
    private readonly artifactsService: ArtifactsService,
    @Inject(ArtifactConflictDetectorService)
    private readonly conflictDetector: ArtifactConflictDetectorService,
    @Inject(ArtifactRevisionsService)
    private readonly revisionsService: ArtifactRevisionsService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard
  ) {}

  @Post()
  async create(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = artifactWorkspaceInputSchema.parse(input ?? {});
    await this.permissionGuard.assert(user.id, workspaceId, "artifact.create");
    return this.artifactsService.create(input, user.id);
  }

  @Get()
  async list(
    @Query("messageId") messageId?: string,
    @Query("workspaceId") workspaceId?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "artifact.read");
    return this.artifactsService.list({
      messageId,
      workspaceId: parsedWorkspaceId
    }, user.id);
  }

  @Post("upload-target")
  async prepareUploadTarget(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = artifactWorkspaceInputSchema.parse(input ?? {});
    await this.permissionGuard.assert(user.id, workspaceId, "artifact.create");
    return this.artifactsService.prepareUploadTarget(input, user.id);
  }

  @Get(":artifactId/revisions")
  async listRevisions(
    @Param("artifactId") artifactId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "artifact.read");
    return this.revisionsService.listForArtifact({
      artifactId,
      ownerUserId: user.id,
      workspaceId: parsedWorkspaceId
    });
  }

  @Post(":artifactId/revisions")
  async appendRevision(
    @Param("artifactId") artifactId: string,
    @Body() input: unknown,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "artifact.create");
    return this.revisionsService.append({
      artifactId,
      ownerUserId: user.id,
      payload: input,
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":artifactId/revisions/:revisionIndex/diff")
  async describeDiff(
    @Param("artifactId") artifactId: string,
    @Param("revisionIndex") revisionIndex: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "artifact.read");
    return this.revisionsService.describeDiff({
      artifactId,
      ownerUserId: user.id,
      revisionIndex: Number.parseInt(revisionIndex, 10),
      workspaceId: parsedWorkspaceId
    });
  }

  @Get(":artifactId/conflicts")
  async detectConflict(
    @Param("artifactId") artifactId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsedWorkspaceId, "artifact.read");
    return this.conflictDetector.detect({
      artifactId,
      ownerUserId: user.id,
      workspaceId: parsedWorkspaceId
    });
  }
}
