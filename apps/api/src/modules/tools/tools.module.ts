import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { ToolRegistrationService } from "./tool-registration.service.js";

@Module({
  exports: [ToolRegistrationService],
  imports: [DatabaseModule],
  providers: [ToolRegistrationService]
})
export class ToolsModule {}
