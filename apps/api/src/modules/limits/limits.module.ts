import { Global, Module } from "@nestjs/common";

import { InMemoryRateLimitRepository } from "./in-memory-rate-limit.repository.js";
import { RedisRateLimitRepository } from "./redis-rate-limit.repository.js";
import { RateLimitService } from "./rate-limit.service.js";
import { RATE_LIMIT_REPOSITORY } from "./rate-limit.types.js";

function resolveRateLimitBackend(): "memory" | "redis" {
  const configuredBackend = process.env.RATE_LIMIT_BACKEND?.trim().toLowerCase();

  if (configuredBackend === "memory" || configuredBackend === "redis") {
    return configuredBackend;
  }

  if (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST_POOL_ID !== undefined ||
    process.env.VITEST_WORKER_ID !== undefined
  ) {
    return "memory";
  }

  return "redis";
}

@Global()
@Module({
  exports: [RateLimitService],
  providers: [
    InMemoryRateLimitRepository,
    RedisRateLimitRepository,
    {
      provide: "RATE_LIMIT_REDIS_URL",
      useFactory: () => process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
    },
    {
      provide: "RATE_LIMIT_REDIS_PREFIX",
      useFactory: () => process.env.RATE_LIMIT_REDIS_PREFIX ?? "agenthub:rate-limit:"
    },
    {
      provide: RATE_LIMIT_REPOSITORY,
      inject: [InMemoryRateLimitRepository, RedisRateLimitRepository],
      useFactory: (
        inMemoryRepository: InMemoryRateLimitRepository,
        redisRepository: RedisRateLimitRepository
      ) => (resolveRateLimitBackend() === "redis" ? redisRepository : inMemoryRepository)
    },
    RateLimitService
  ]
})
export class LimitsModule {}
