import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { DeploysController } from "./deploys.controller.js";
import { DeployDispatchService } from "./dispatch.service.js";
import { PreviewUrlService } from "./preview-url.service.js";
import { DeployTargetsController } from "./targets.controller.js";
import { DeployTargetsService } from "./targets.service.js";

@Module({
  controllers: [DeploysController, DeployTargetsController],
  imports: [AuthModule, DatabaseModule, WorkspacesModule],
  exports: [DeployTargetsService],
  providers: [DeployDispatchService, PreviewUrlService, DeployTargetsService]
})
export class DeploysModule {}
