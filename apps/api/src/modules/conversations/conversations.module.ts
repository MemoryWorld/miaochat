import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";
import { GroupMembersService } from "./group-members.service.js";

@Module({
  controllers: [ConversationsController],
  imports: [DatabaseModule],
  exports: [GroupMembersService],
  providers: [ConversationsService, GroupMembersService]
})
export class ConversationsModule {}
