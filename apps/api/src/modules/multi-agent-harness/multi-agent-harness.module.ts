import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { MultiAgentHarnessController } from "./multi-agent-harness.controller.js";
import { MultiAgentHarnessRepository } from "./multi-agent-harness.repository.js";
import { MultiAgentHarnessService } from "./multi-agent-harness.service.js";

@Module({
  controllers: [MultiAgentHarnessController],
  exports: [MultiAgentHarnessService],
  imports: [AuthModule, ChannelsModule, DatabaseModule],
  providers: [MultiAgentHarnessRepository, MultiAgentHarnessService]
})
export class MultiAgentHarnessModule {}
