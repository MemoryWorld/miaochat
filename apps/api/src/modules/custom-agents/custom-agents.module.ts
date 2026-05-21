import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { CustomAgentsController } from "./custom-agents.controller.js";
import { CustomAgentsService } from "./custom-agents.service.js";

@Module({
  controllers: [CustomAgentsController],
  imports: [DatabaseModule],
  providers: [CustomAgentsService]
})
export class CustomAgentsModule {}
