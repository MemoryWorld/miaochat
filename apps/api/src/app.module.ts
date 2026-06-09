import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ArtifactsModule } from "./modules/artifacts/artifacts.module.js";
import { ChannelsModule } from "./modules/channels/channels.module.js";
import { ConversationsModule } from "./modules/conversations/conversations.module.js";
import { CodingWorkflowsModule } from "./modules/coding-workflows/coding-workflows.module.js";
import { CredentialsModule } from "./modules/credentials/credentials.module.js";
import { CustomAgentsModule } from "./modules/custom-agents/custom-agents.module.js";
import { DeploysModule } from "./modules/deploys/deploys.module.js";
import { LimitsModule } from "./modules/limits/limits.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { MultiAgentHarnessModule } from "./modules/multi-agent-harness/multi-agent-harness.module.js";
import { QuotaModule } from "./modules/quota/quota.module.js";
import { StreamsModule } from "./modules/streams/streams.module.js";
import { ToolsModule } from "./modules/tools/tools.module.js";
import { VisualWorkflowsModule } from "./modules/visual-workflows/visual-workflows.module.js";
import { WorkspaceShellModule } from "./modules/workspace-shell/workspace-shell.module.js";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";

@Module({
  imports: [
    ObservabilityModule,
    HealthModule,
    AuthModule,
    ArtifactsModule,
    ChannelsModule,
    CodingWorkflowsModule,
    CredentialsModule,
    CustomAgentsModule,
    DeploysModule,
    ConversationsModule,
    LimitsModule,
    MessagesModule,
    MultiAgentHarnessModule,
    QuotaModule,
    StreamsModule,
    ToolsModule,
    VisualWorkflowsModule,
    WorkspaceShellModule,
    WorkspacesModule
  ]
})
export class AppModule {}
