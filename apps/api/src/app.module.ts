import { Module } from "@nestjs/common";

import { HealthModule } from "./health/health.module.js";
import { ConversationsModule } from "./modules/conversations/conversations.module.js";
import { CredentialsModule } from "./modules/credentials/credentials.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { StreamsModule } from "./modules/streams/streams.module.js";

@Module({
  imports: [
    HealthModule,
    CredentialsModule,
    ConversationsModule,
    MessagesModule,
    StreamsModule
  ]
})
export class AppModule {}
