import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ChannelsModule } from "../channels/channels.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { ArtifactsController } from "./artifacts.controller.js";
import { ArtifactsService } from "./artifacts.service.js";
import { ArtifactConflictDetectorService } from "./conflict-detector.service.js";
import { ArtifactRevisionsService } from "./revisions.service.js";
import { AttachmentScanStubService } from "./scan-stub.service.js";
import { StorageService } from "./storage.service.js";

@Module({
  controllers: [ArtifactsController],
  exports: [
    ArtifactConflictDetectorService,
    ArtifactRevisionsService,
    ArtifactsService,
    AttachmentScanStubService,
    StorageService
  ],
  imports: [AuthModule, ChannelsModule, DatabaseModule, WorkspacesModule],
  providers: [
    ArtifactConflictDetectorService,
    ArtifactRevisionsService,
    ArtifactsService,
    AttachmentScanStubService,
    StorageService
  ]
})
export class ArtifactsModule {}
