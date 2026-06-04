import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { ConversationsModule } from "../conversations/conversations.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { StreamsModule } from "../streams/streams.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { MessageDispatchService } from "./message-dispatch.service.js";
import { MessageRegenerateService } from "./message-regenerate.service.js";
import { MessagesController } from "./messages.controller.js";
import { MessagesRepository } from "./messages.repository.js";
import { MessagesService } from "./messages.service.js";
import { MultiAgentHarnessModule } from "../multi-agent-harness/multi-agent-harness.module.js";
import { PinMessageService } from "./pin-message.service.js";

@Module({
  controllers: [MessagesController],
  imports: [
    ArtifactsModule,
    AuthModule,
    ChannelsModule,
    ConversationsModule,
    DatabaseModule,
    MultiAgentHarnessModule,
    StreamsModule,
    WorkspacesModule
  ],
  providers: [
    MessageDispatchService,
    MessageRegenerateService,
    MessagesRepository,
    MessagesService,
    PinMessageService
  ]
})
export class MessagesModule {}
