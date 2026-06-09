import { Module } from "@nestjs/common";

import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ConversationsModule } from "../conversations/conversations.module.js";
import { CustomAgentsModule } from "../custom-agents/custom-agents.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { CodingWorkflowDispatchService } from "./coding-workflow-dispatch.service.js";
import { CodingWorkflowsController } from "./coding-workflows.controller.js";
import { CodingWorkflowsService } from "./coding-workflows.service.js";

@Module({
  controllers: [CodingWorkflowsController],
  imports: [
    AuthModule,
    ArtifactsModule,
    ConversationsModule,
    CustomAgentsModule,
    DatabaseModule,
    StreamsModule,
    WorkspacesModule
  ],
  exports: [CodingWorkflowsService],
  providers: [CodingWorkflowDispatchService, CodingWorkflowsService]
})
export class CodingWorkflowsModule {}
