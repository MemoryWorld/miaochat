import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { CustomAgentsController } from "./custom-agents.controller.js";
import { CustomAgentsService } from "./custom-agents.service.js";

@Module({
  controllers: [CustomAgentsController],
  imports: [AuthModule, DatabaseModule, WorkspacesModule],
  providers: [CustomAgentsService]
})
export class CustomAgentsModule {}
