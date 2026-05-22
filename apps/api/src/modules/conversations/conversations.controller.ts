import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";
import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { ConversationAccessService } from "./conversation-access.service.js";
import { ConversationSharesService } from "./conversation-shares.service.js";
import { ConversationsService } from "./conversations.service.js";

const createInputSchema = z.object({
  workspaceId: z.string().min(1).default("default-workspace")
});

@Controller("conversations")
export class ConversationsController {
  constructor(
    @Inject(ConversationAccessService)
    private readonly accessService: ConversationAccessService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(ConversationSharesService)
    private readonly sharesService: ConversationSharesService,
    @Inject(ConversationsService)
    private readonly conversationsService: ConversationsService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard
  ) {}

  @Post()
  async create(@Body() input: unknown, @Headers("cookie") cookieHeader: string | undefined) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = createInputSchema.parse({
      workspaceId:
        (input && typeof input === "object" && (input as { workspaceId?: unknown }).workspaceId) ||
        undefined
    });
    await this.permissionGuard.assert(user.id, workspaceId, "conversation.create");
    return this.conversationsService.create(input, user.id);
  }

  @Get()
  async list(
    @Query("workspaceId") workspaceId?: string,
    @Query("search") search?: string,
    @Query("includeArchived") includeArchived?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "conversation.read");
    return this.conversationsService.list(parsed, user.id, {
      includeArchived: includeArchived === "true" || includeArchived === "1",
      search
    });
  }

  @Post(":conversationId/pin")
  @HttpCode(200)
  async pin(
    @Param("conversationId") conversationId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "conversation.update");
    return this.conversationsService.setPinned(parsed, user.id, conversationId, true);
  }

  @Post(":conversationId/unpin")
  @HttpCode(200)
  async unpin(
    @Param("conversationId") conversationId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "conversation.update");
    return this.conversationsService.setPinned(parsed, user.id, conversationId, false);
  }

  @Post(":conversationId/archive")
  @HttpCode(200)
  async archive(
    @Param("conversationId") conversationId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "conversation.update");
    return this.conversationsService.archive(parsed, user.id, conversationId);
  }

  @Post(":conversationId/restore")
  @HttpCode(200)
  async restore(
    @Param("conversationId") conversationId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "conversation.update");
    return this.conversationsService.restore(parsed, user.id, conversationId);
  }

  @Post(":conversationId/shares")
  async share(
    @Param("conversationId") conversationId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.sharesService.share(user.id, conversationId, input);
  }

  @Get(":conversationId/shares")
  async listShares(
    @Param("conversationId") conversationId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.sharesService.list(user.id, conversationId);
  }

  @Delete(":conversationId/shares/:userId")
  @HttpCode(200)
  async revokeShare(
    @Param("conversationId") conversationId: string,
    @Param("userId") userId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    await this.sharesService.revoke(user.id, conversationId, userId);
    return { revoked: true };
  }

  @Get(":conversationId/access-review")
  async accessReview(
    @Param("conversationId") conversationId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.accessService.listForConversation(user.id, conversationId);
  }
}
