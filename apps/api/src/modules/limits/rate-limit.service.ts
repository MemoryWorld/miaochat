import { Injectable } from "@nestjs/common";
import { Inject } from "@nestjs/common";

import {
  RATE_LIMIT_REPOSITORY,
  type RateLimitConfig,
  type RateLimitConsumeInput,
  type RateLimitConsumeResult,
  type RateLimitRepository
} from "./rate-limit.types.js";

const defaultLimit = Number(process.env.RATE_LIMIT_PER_CONVERSATION_LIMIT ?? 30);
const defaultWindowMs = Number(
  process.env.RATE_LIMIT_PER_CONVERSATION_WINDOW_MS ?? 60_000
);

@Injectable()
export class RateLimitService {
  private config: RateLimitConfig = {
    limit: Number.isFinite(defaultLimit) && defaultLimit > 0 ? defaultLimit : 30,
    windowMs:
      Number.isFinite(defaultWindowMs) && defaultWindowMs > 0
        ? defaultWindowMs
        : 60_000
  };

  constructor(
    @Inject(RATE_LIMIT_REPOSITORY)
    private readonly repository: RateLimitRepository
  ) {}

  configure(config: Partial<RateLimitConfig>): void {
    this.config = {
      limit: config.limit ?? this.config.limit,
      windowMs: config.windowMs ?? this.config.windowMs
    };
  }

  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  async consume(input: RateLimitConsumeInput): Promise<RateLimitConsumeResult> {
    const limit = input.limit ?? this.config.limit;
    const windowMs = input.windowMs ?? this.config.windowMs;

    return this.repository.consume({
      key: input.key,
      limit,
      windowMs
    });
  }

  async reset(): Promise<void> {
    await this.repository.reset();
  }
}
