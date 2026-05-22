import { Inject, Injectable, type OnModuleDestroy, Optional } from "@nestjs/common";
import { createClient } from "redis";

import type {
  RateLimitConsumeResult,
  RateLimitRepository
} from "./rate-limit.types.js";

const defaultRedisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const defaultPrefix = process.env.RATE_LIMIT_REDIS_PREFIX ?? "agenthub:rate-limit:";

const consumeScript = `
local current = redis.call("GET", KEYS[1])

if not current then
  redis.call("SET", KEYS[1], 1, "PX", ARGV[2], "NX")
  return {1, tonumber(ARGV[1]) - 1, 0}
end

local ttl = redis.call("PTTL", KEYS[1])

if ttl < 0 then
  redis.call("SET", KEYS[1], 1, "PX", ARGV[2])
  return {1, tonumber(ARGV[1]) - 1, 0}
end

local count = tonumber(current)

if count < tonumber(ARGV[1]) then
  count = redis.call("INCR", KEYS[1])
  return {1, tonumber(ARGV[1]) - count, 0}
end

return {0, 0, ttl}
`;

type RedisRateLimitClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisRateLimitRepository implements OnModuleDestroy, RateLimitRepository {
  private client: RedisRateLimitClient | undefined;
  private connectPromise: Promise<RedisRateLimitClient> | undefined;

  constructor(
    @Optional() @Inject("RATE_LIMIT_REDIS_URL") private readonly redisUrl = defaultRedisUrl,
    @Optional()
    @Inject("RATE_LIMIT_REDIS_PREFIX")
    private readonly redisPrefix = defaultPrefix
  ) {}

  async consume(input: {
    key: string;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitConsumeResult> {
    const client = await this.getClient();
    const rawResult = (await client.sendCommand([
      "EVAL",
      consumeScript,
      "1",
      this.toRedisKey(input.key),
      String(input.limit),
      String(input.windowMs)
    ])) as Array<number | string>;

    return {
      allowed: Number(rawResult[0] ?? 0) === 1,
      remaining: Math.max(Number(rawResult[1] ?? 0), 0),
      retryAfterMs: Math.max(Number(rawResult[2] ?? 0), 0)
    };
  }

  async reset(): Promise<void> {
    const client = await this.getClient();
    const keys = await client.keys(`${this.redisPrefix}*`);

    if (keys.length > 0) {
      await client.sendCommand(["DEL", ...keys]);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;

    this.client = undefined;
    this.connectPromise = undefined;

    if (client?.isOpen) {
      await client.quit();
    }
  }

  private async getClient(): Promise<RedisRateLimitClient> {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (!this.connectPromise) {
      const client = createClient({
        url: this.redisUrl
      });

      this.client = client;
      this.connectPromise = client.connect().then(() => client).catch((error) => {
        this.client = undefined;
        this.connectPromise = undefined;
        throw error;
      });
    }

    return await this.connectPromise;
  }

  private toRedisKey(key: string): string {
    return `${this.redisPrefix}${key}`;
  }
}
