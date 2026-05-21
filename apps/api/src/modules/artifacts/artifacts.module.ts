import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { ArtifactsController } from "./artifacts.controller.js";
import { ArtifactsService } from "./artifacts.service.js";
import { StorageService } from "./storage.service.js";

@Module({
  controllers: [ArtifactsController],
  exports: [ArtifactsService, StorageService],
  imports: [DatabaseModule],
  providers: [ArtifactsService, StorageService]
})
export class ArtifactsModule {}
