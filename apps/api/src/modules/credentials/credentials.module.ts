import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { CredentialsController } from "./credentials.controller.js";
import { CredentialsService } from "./credentials.service.js";

@Module({
  controllers: [CredentialsController],
  imports: [DatabaseModule],
  providers: [CredentialsService]
})
export class CredentialsModule {}
