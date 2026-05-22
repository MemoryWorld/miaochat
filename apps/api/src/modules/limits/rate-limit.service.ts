import { Injectable } from "@nestjs/common";

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export type RateLimitConsumeInput = {
  key: string;
  limit?: number;
  windowMs?: number;
};

export type RateLimitConsumeResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const defaultLimit = Number(process.env.RATE_LIMIT_PER_CONVERSATION_LIMIT ?? 30);
const defaultWindowMs = Number(
  process.env.RATE_LIMIT_PER_CONVERSATION_WINDOW_MS ?? 60_000
);

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private config: RateLimitConfig = {
    limit: Number.isFinite(defaultLimit) && defaultLimit > 0 ? defaultLimit : 30,
    windowMs:
      Number.isFinite(defaultWindowMs) && defaultWindowMs > 0
        ? defaultWindowMs
        : 60_000
  };

  configure(config: Partial<RateLimitConfig>): void {
    this.config = {
      limit: config.limit ?? this.config.limit,
      windowMs: config.windowMs ?? this.config.windowMs
    };
  }

  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  consume(input: RateLimitConsumeInput): RateLimitConsumeResult {
    const limit = input.limit ?? this.config.limit;
    const windowMs = input.windowMs ?? this.config.windowMs;
    const now = Date.now();
    const bucket = this.buckets.get(input.key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(input.key, {
        count: 1,
        resetAt: now + windowMs
      });
      return {
        allowed: true,
        remaining: Math.max(limit - 1, 0),
        retryAfterMs: 0
      };
    }

    if (bucket.count < limit) {
      bucket.count += 1;
      return {
        allowed: true,
        remaining: Math.max(limit - bucket.count, 0),
        retryAfterMs: 0
      };
    }

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(bucket.resetAt - now, 0)
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}
