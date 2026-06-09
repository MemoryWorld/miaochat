import { Module } from "@nestjs/common";

import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { VisualWorkflowsController } from "./visual-workflows.controller.js";
import { VisualWorkflowsService } from "./visual-workflows.service.js";

@Module({
  controllers: [VisualWorkflowsController],
  exports: [VisualWorkflowsService],
  imports: [ArtifactsModule, AuthModule, ChannelsModule, DatabaseModule],
  providers: [VisualWorkflowsService]
})
export class VisualWorkflowsModule {}
