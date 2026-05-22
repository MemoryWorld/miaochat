import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { QuotaModule } from "../quota/quota.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { CredentialsController } from "./credentials.controller.js";
import { CredentialPoolService } from "./pool.service.js";
import { CredentialsService } from "./credentials.service.js";

@Module({
  controllers: [CredentialsController],
  imports: [AuthModule, DatabaseModule, QuotaModule, WorkspacesModule],
  exports: [CredentialPoolService, CredentialsService],
  providers: [CredentialPoolService, CredentialsService]
})
export class CredentialsModule {}
