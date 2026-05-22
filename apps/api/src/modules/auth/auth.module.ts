import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { AuthAuditService } from "./auth-audit.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import { AuthService } from "./auth.service.js";

@Module({
  controllers: [AuthController],
  imports: [DatabaseModule],
  exports: [AuthService],
  providers: [AuthAuditService, AuthRateLimitService, AuthService]
})
export class AuthModule {}
