import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { QuotaService } from "./quota.service.js";

@Module({
  exports: [QuotaService],
  imports: [DatabaseModule],
  providers: [QuotaService]
})
export class QuotaModule {}
