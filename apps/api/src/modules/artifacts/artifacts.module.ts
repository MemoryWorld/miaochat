import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
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
  imports: [DatabaseModule],
  providers: [
    ArtifactConflictDetectorService,
    ArtifactRevisionsService,
    ArtifactsService,
    AttachmentScanStubService,
    StorageService
  ]
})
export class ArtifactsModule {}
