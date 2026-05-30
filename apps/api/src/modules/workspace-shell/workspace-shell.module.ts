import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { CustomAgentsModule } from "../custom-agents/custom-agents.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { WorkspaceShellController } from "./workspace-shell.controller.js";
import { WorkspaceShellService } from "./workspace-shell.service.js";

@Module({
  controllers: [WorkspaceShellController],
  exports: [WorkspaceShellService],
  imports: [AuthModule, CustomAgentsModule, DatabaseModule, WorkspacesModule],
  providers: [WorkspaceShellService]
})
export class WorkspaceShellModule {}
