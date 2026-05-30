import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ChannelMembersRepository } from "./channel-members.repository.js";
import { ChannelMembersService } from "./channel-members.service.js";
import { ChannelsController } from "./channels.controller.js";

@Module({
  controllers: [ChannelsController],
  exports: [ChannelMembersService],
  imports: [AuthModule, DatabaseModule, WorkspacesModule],
  providers: [ChannelMembersRepository, ChannelMembersService]
})
export class ChannelsModule {}
