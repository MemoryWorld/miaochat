import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";

import { workspaceIdSchema } from "@agenthub/contracts";

import { MessageDispatchService } from "./message-dispatch.service.js";
import { MessagesService } from "./messages.service.js";

@Controller("messages")
export class MessagesController {
  constructor(
    @Inject(MessageDispatchService)
    private readonly messageDispatchService: MessageDispatchService,
    @Inject(MessagesService)
    private readonly messagesService: MessagesService
  ) {}

  @Post()
  create(@Body() input: unknown) {
    return this.messagesService.create(input);
  }

  @Post("send")
  @HttpCode(202)
  send(@Body() input: unknown) {
    return this.messageDispatchService.send(input);
  }

  @Get()
  list(
    @Query("conversationId") conversationId?: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.messagesService.list({
      conversationId,
      workspaceId: workspaceIdSchema.parse(workspaceId ?? "default-workspace")
    });
  }

  @Post(":messageId/pin")
  @HttpCode(200)
  pin(
    @Param("messageId") messageId: string,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.messagesService.pin(
      messageId,
      workspaceIdSchema.parse(workspaceId ?? "default-workspace")
    );
  }
}
