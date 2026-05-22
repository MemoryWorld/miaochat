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
import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { MessageDispatchService } from "./message-dispatch.service.js";
import { MessageRegenerateService } from "./message-regenerate.service.js";
import { MessagesService } from "./messages.service.js";

const messageInputSchema = z
  .object({ workspaceId: z.string().min(1).default("default-workspace") })
  .passthrough();

@Controller("messages")
export class MessagesController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(MessageDispatchService)
    private readonly messageDispatchService: MessageDispatchService,
    @Inject(MessageRegenerateService)
    private readonly regenerateService: MessageRegenerateService,
    @Inject(MessagesService)
    private readonly messagesService: MessagesService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard
  ) {}

  @Post()
  async create(@Body() input: unknown, @Headers("cookie") cookieHeader: string | undefined) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = messageInputSchema.parse(input ?? {});
    await this.permissionGuard.assert(user.id, workspaceId, "message.send");
    return this.messagesService.create(input, user.id);
  }

  @Post("send")
  @HttpCode(202)
  async send(@Body() input: unknown, @Headers("cookie") cookieHeader: string | undefined) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = messageInputSchema.parse(input ?? {});
    await this.permissionGuard.assert(user.id, workspaceId, "message.send");
    return this.messageDispatchService.send(input, user.id);
  }

  @Get()
  async list(
    @Query("conversationId") conversationId?: string,
    @Query("workspaceId") workspaceId?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "message.read");
    return this.messagesService.list({
      conversationId,
      ownerUserId: user.id,
      workspaceId: parsed
    });
  }

  @Post(":messageId/pin")
  @HttpCode(200)
  async pin(
    @Param("messageId") messageId: string,
    @Query("workspaceId") workspaceId?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "conversation.update");
    return this.messagesService.pin(messageId, parsed, user.id);
  }

  @Post(":messageId/regenerate")
  @HttpCode(202)
  async regenerate(
    @Param("messageId") messageId: string,
    @Query("workspaceId") workspaceId: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    await this.permissionGuard.assert(user.id, parsed, "message.send");
    return this.regenerateService.request({
      messageId,
      ownerUserId: user.id,
      workspaceId: parsed
    });
  }
}
