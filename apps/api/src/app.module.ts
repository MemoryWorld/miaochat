import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module.js";
import { ConversationsModule } from "./modules/conversations/conversations.module.js";
import { CredentialsModule } from "./modules/credentials/credentials.module.js";
import { CustomAgentsModule } from "./modules/custom-agents/custom-agents.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { StreamsModule } from "./modules/streams/streams.module.js";
import { ToolsModule } from "./modules/tools/tools.module.js";

@Module({
  imports: [
    HealthModule,
    CredentialsModule,
    CustomAgentsModule,
    ConversationsModule,
    MessagesModule,
    StreamsModule,
    ToolsModule
  ]
})
export class AppModule {}
