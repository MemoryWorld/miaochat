import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";

@Module({
  controllers: [ConversationsController],
  imports: [DatabaseModule],
  providers: [ConversationsService]
})
export class ConversationsModule {}
