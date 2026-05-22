import { Global, Module } from "@nestjs/common";

import { RateLimitService } from "./rate-limit.service.js";

@Global()
@Module({
  exports: [RateLimitService],
  providers: [RateLimitService]
})
export class LimitsModule {}
