import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { PresenceBrokerService } from "./presence-broker.service.js";
import { StreamBrokerService } from "./stream-broker.service.js";
import { StreamsController } from "./streams.controller.js";

@Module({
  controllers: [StreamsController],
  exports: [PresenceBrokerService, StreamBrokerService],
  imports: [AuthModule, DatabaseModule, WorkspacesModule],
  providers: [PresenceBrokerService, StreamBrokerService]
})
export class StreamsModule {}
