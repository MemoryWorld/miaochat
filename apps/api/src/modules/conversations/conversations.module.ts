import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ConversationAccessService } from "./conversation-access.service.js";
import { ConversationSharesService } from "./conversation-shares.service.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";
import { GroupMembersService } from "./group-members.service.js";

@Module({
  controllers: [ConversationsController],
  imports: [AuthModule, DatabaseModule, WorkspacesModule],
  exports: [ConversationAccessService, ConversationSharesService, GroupMembersService],
  providers: [
    ConversationAccessService,
    ConversationSharesService,
    ConversationsService,
    GroupMembersService
  ]
})
export class ConversationsModule {}
