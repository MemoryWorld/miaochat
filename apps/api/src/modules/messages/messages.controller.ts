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
import { MessageDispatchService } from "./message-dispatch.service.js";
import { MessageRegenerateService } from "./message-regenerate.service.js";
import { MessagesService } from "./messages.service.js";

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
    private readonly messagesService: MessagesService
  ) {}

  @Post()
  async create(@Body() input: unknown, @Headers("cookie") cookieHeader: string | undefined) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.messagesService.create(input, user.id);
  }

  @Post("send")
  @HttpCode(202)
  async send(@Body() input: unknown, @Headers("cookie") cookieHeader: string | undefined) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
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
    return this.messagesService.pin(messageId, parsed, user.id);
  }

  @Post(":messageId/unpin")
  @HttpCode(200)
  async unpin(
    @Param("messageId") messageId: string,
    @Query("workspaceId") workspaceId?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    return this.messagesService.unpin(messageId, parsed, user.id);
  }

  @Get(":messageId/thread")
  async getThread(
    @Param("messageId") messageId: string,
    @Query("workspaceId") workspaceId?: string,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = workspaceIdSchema.parse(workspaceId ?? "default-workspace");
    return this.messagesService.getThread(messageId, parsed, user.id);
  }

  @Post(":messageId/reactions")
  @HttpCode(200)
  async toggleReaction(
    @Param("messageId") messageId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.messagesService.toggleReaction(messageId, input, user.id);
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
    return this.regenerateService.request({
      messageId,
      ownerUserId: user.id,
      workspaceId: parsed
    });
  }
}
