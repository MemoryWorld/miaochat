import { Module } from "@nestjs/common";

import { ConversationsModule } from "../conversations/conversations.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { MessageDispatchService } from "./message-dispatch.service.js";
import { MessagesController } from "./messages.controller.js";
import { MessagesService } from "./messages.service.js";
import { PinMessageService } from "./pin-message.service.js";

@Module({
  controllers: [MessagesController],
  imports: [ConversationsModule, DatabaseModule, StreamsModule],
  providers: [MessagesService, PinMessageService, MessageDispatchService]
})
export class MessagesModule {}
