import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ConversationsModule } from "../conversations/conversations.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { MessageDispatchService } from "./message-dispatch.service.js";
import { MessageRegenerateService } from "./message-regenerate.service.js";
import { MessagesController } from "./messages.controller.js";
import { MessagesService } from "./messages.service.js";
import { PinMessageService } from "./pin-message.service.js";

@Module({
  controllers: [MessagesController],
  imports: [AuthModule, ConversationsModule, DatabaseModule, StreamsModule, WorkspacesModule],
  providers: [
    MessageDispatchService,
    MessageRegenerateService,
    MessagesService,
    PinMessageService
  ]
})
export class MessagesModule {}
