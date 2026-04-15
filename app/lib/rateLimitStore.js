import { createClient } from "redis";
import { logger } from "./logger.js";
import { env } from "../../config/env.js";

let redisClient = null;
let redisReady = false;
let redisInitAttempted = false;

const memoryStore = new Map();

const ensureRedisClient = async () => {
  if (!env.redisUrl) return null;
  if (redisReady && redisClient) return redisClient;
  if (redisInitAttempted && !redisReady) return null;

  redisInitAttempted = true;
  try {
    redisClient = createClient({ url: env.redisUrl });
    redisClient.on("error", (error) =>
      logger.warn("Redis rate-limit client error", {}, error)
    );
    await redisClient.connect();
    redisReady = true;
    logger.info("Redis rate-limit store connected");
    return redisClient;
  } catch (error) {
    redisReady = false;
    logger.warn("Redis unavailable, fallback to in-memory rate limit", {}, error);
    return null;
  }
};

export const consumeRateLimit = async ({ key, windowMs, max }) => {
  const client = await ensureRedisClient();
  const now = Date.now();

  if (client) {
    const redisKey = `rl:${key}`;
    const count = await client.incr(redisKey);
    const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    if (count === 1) {
      await client.expire(redisKey, ttlSeconds);
    }
    const ttl = await client.ttl(redisKey);
    const resetAt = now + Math.max(0, ttl) * 1000;
    return { count, resetAt, remaining: Math.max(0, max - count) };
  }

  if (memoryStore.size > 1000) {
    for (const [storeKey, value] of memoryStore.entries()) {
      if (!value || value.resetAt <= now) {
        memoryStore.delete(storeKey);
      }
    }
  }

  const current = memoryStore.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return { count: 1, resetAt, remaining: Math.max(0, max - 1) };
  }

  current.count += 1;
  return {
    count: current.count,
    resetAt: current.resetAt,
    remaining: Math.max(0, max - current.count),
  };
};
