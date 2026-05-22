import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ArtifactsModule } from "./modules/artifacts/artifacts.module.js";
import { ConversationsModule } from "./modules/conversations/conversations.module.js";
import { CredentialsModule } from "./modules/credentials/credentials.module.js";
import { CustomAgentsModule } from "./modules/custom-agents/custom-agents.module.js";
import { LimitsModule } from "./modules/limits/limits.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { StreamsModule } from "./modules/streams/streams.module.js";
import { ToolsModule } from "./modules/tools/tools.module.js";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";

@Module({
  imports: [
    ObservabilityModule,
    HealthModule,
    AuthModule,
    ArtifactsModule,
    CredentialsModule,
    CustomAgentsModule,
    ConversationsModule,
    LimitsModule,
    MessagesModule,
    StreamsModule,
    ToolsModule,
    WorkspacesModule
  ]
})
export class AppModule {}
