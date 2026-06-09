import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Res
} from "@nestjs/common";
import { z } from "zod";

import { workspaceIdSchema } from "@agenthub/contracts";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { ArtifactsService } from "./artifacts.service.js";
import { ArtifactConflictDetectorService } from "./conflict-detector.service.js";
import { ArtifactRevisionsService } from "./revisions.service.js";

type ArtifactFileReply = {
  header: (name: string, value: string) => ArtifactFileReply;
  send: (payload: unknown) => unknown;
};

const artifactFileDispositionSchema = z.enum(["inline", "attachment"]).default("attachment");

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
    return this.artifactsService.create(input, user.id);
  }

  @Get()
  async list(
    @Query("conversationId") conversationId?: string,
    @Query("messageId") messageId?: string,
    @Query("workspaceId") workspaceId?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    return this.artifactsService.list({
      conversationId,
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
    return this.artifactsService.prepareUploadTarget(input, user.id);
  }

  @Get(":artifactId/content")
  async readContent(
    @Param("artifactId") artifactId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    return this.artifactsService.readTextContent({
      artifactId,
      workspaceId: parsedWorkspaceId
    }, user.id);
  }

  @Get(":artifactId/download")
  async createDownloadUrl(
    @Param("artifactId") artifactId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    return this.artifactsService.createDownloadUrl({
      artifactId,
      workspaceId: parsedWorkspaceId
    }, user.id);
  }

  @Get(":artifactId/file")
  async readFile(
    @Param("artifactId") artifactId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("disposition") disposition: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() reply: ArtifactFileReply
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    const parsedDisposition = artifactFileDispositionSchema.parse(disposition ?? "attachment");
    const file = await this.artifactsService.readFileContent({
      artifactId,
      workspaceId: parsedWorkspaceId
    }, user.id);

    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", buildContentDisposition(parsedDisposition, file.fileName));
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");

    if (typeof file.contentLength === "number") {
      reply.header("Content-Length", String(file.contentLength));
    }

    return reply.send(file.body);
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

function buildContentDisposition(
  disposition: "attachment" | "inline",
  fileName: string
): string {
  const sanitizedFileName = sanitizeHeaderFileName(fileName);
  const asciiFallback = sanitizedFileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[%;]/g, "_");
  const fallback = asciiFallback.length > 0 ? asciiFallback : "artifact";

  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(sanitizedFileName)}`;
}

function sanitizeHeaderFileName(fileName: string): string {
  const sanitized = fileName
    .replace(/["\\\r\n]/g, "")
    .replace(/[/]+/g, "-")
    .trim();

  return sanitized.length > 0 ? sanitized : "artifact";
}
