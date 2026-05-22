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

export type RateLimitRepository = {
  consume(input: Required<RateLimitConsumeInput>): Promise<RateLimitConsumeResult>;
  reset(): Promise<void>;
};

export const RATE_LIMIT_REPOSITORY = Symbol("RATE_LIMIT_REPOSITORY");
