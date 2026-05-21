import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { MessageDispatchService } from "./message-dispatch.service.js";
import { MessagesController } from "./messages.controller.js";
import { MessagesService } from "./messages.service.js";

@Module({
  controllers: [MessagesController],
  imports: [DatabaseModule, StreamsModule],
  providers: [MessagesService, MessageDispatchService]
})
export class MessagesModule {}
