import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import type { DealEvent } from "../types.js";

export const QUEUE_NAME = "deal-events";

const connectionOpts = { url: config.redisUrl, maxRetriesPerRequest: null as null };

let redisClient: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  }
  return redisClient;
}

export function createEventQueue(): Queue {
  return new Queue(QUEUE_NAME, {
    connection: connectionOpts,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  });
}

export function createEventWorker(
  processor: (job: Job<DealEvent>) => Promise<void>
): Worker<DealEvent> {
  return new Worker<DealEvent>(QUEUE_NAME, processor, {
    connection: connectionOpts,
    concurrency: 20,
  });
}

/** Per-deal ordering: buffer events in a Redis sorted set keyed by occurred_at */
export async function enqueueForDeal(redis: Redis, event: DealEvent): Promise<void> {
  const score = new Date(event.occurred_at).getTime();
  const pendingKey = `deal:${event.deal_id}:pending`;
  const payloadKey = `deal:${event.deal_id}:payloads`;
  await redis
    .multi()
    .zadd(pendingKey, score, event.event_id)
    .hset(payloadKey, event.event_id, JSON.stringify(event))
    .exec();
}

export async function peekNextDealEvent(
  redis: Redis,
  dealId: string
): Promise<DealEvent | null> {
  const pendingKey = `deal:${dealId}:pending`;
  const payloadKey = `deal:${dealId}:payloads`;
  const items = await redis.zrange(pendingKey, 0, 0);
  if (!items.length) return null;
  const raw = await redis.hget(payloadKey, items[0]!);
  if (!raw) return null;
  return JSON.parse(raw) as DealEvent;
}

export async function popDealEvent(redis: Redis, dealId: string, event: DealEvent): Promise<void> {
  const pendingKey = `deal:${dealId}:pending`;
  const payloadKey = `deal:${dealId}:payloads`;
  await redis
    .multi()
    .zrem(pendingKey, event.event_id)
    .hdel(payloadKey, event.event_id)
    .exec();
}

export async function acquireDealLock(redis: Redis, dealId: string, ttlMs = 10000): Promise<boolean> {
  const result = await redis.set(`lock:deal:${dealId}`, "1", "PX", ttlMs, "NX");
  return result === "OK";
}

export async function releaseDealLock(redis: Redis, dealId: string): Promise<void> {
  await redis.del(`lock:deal:${dealId}`);
}
