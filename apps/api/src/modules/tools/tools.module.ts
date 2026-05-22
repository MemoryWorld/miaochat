import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { HeavyAgentMetricsService } from "./heavy-agent-metrics.service.js";
import { ToolRegistrationService } from "./tool-registration.service.js";

@Module({
  exports: [HeavyAgentMetricsService, ToolRegistrationService],
  imports: [DatabaseModule, WorkspacesModule],
  providers: [HeavyAgentMetricsService, ToolRegistrationService]
})
export class ToolsModule {}
