import { Injectable } from "@nestjs/common";

import type {
  RateLimitConsumeResult,
  RateLimitRepository
} from "./rate-limit.types.js";

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class InMemoryRateLimitRepository implements RateLimitRepository {
  private readonly buckets = new Map<string, Bucket>();

  async consume(input: {
    key: string;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitConsumeResult> {
    const now = Date.now();
    const bucket = this.buckets.get(input.key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(input.key, {
        count: 1,
        resetAt: now + input.windowMs
      });
      return {
        allowed: true,
        remaining: Math.max(input.limit - 1, 0),
        retryAfterMs: 0
      };
    }

    if (bucket.count < input.limit) {
      bucket.count += 1;
      return {
        allowed: true,
        remaining: Math.max(input.limit - bucket.count, 0),
        retryAfterMs: 0
      };
    }

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(bucket.resetAt - now, 0)
    };
  }

  async reset(): Promise<void> {
    this.buckets.clear();
  }
}
