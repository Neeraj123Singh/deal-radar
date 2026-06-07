import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import type { Sql } from "../db/migrate.js";
import {
  isEventProcessed,
  recordProcessedEvent,
  recordDeadLetter,
  upsertDealFromEvent,
} from "../db/queries.js";
import {
  acquireDealLock,
  releaseDealLock,
  enqueueForDeal,
  peekNextDealEvent,
  popDealEvent,
} from "../queue/index.js";
import { DealEventSchema, type DealEvent, type StreamEvent } from "../types.js";
import type { EventBroadcaster } from "./sse.js";

export function createEventProcessor(
  sql: Sql,
  redis: Redis,
  broadcaster: EventBroadcaster
) {
  return async (job: Job<DealEvent>): Promise<void> => {
    const parsed = DealEventSchema.safeParse(job.data);
    if (!parsed.success) {
      await recordDeadLetter(sql, job.data, parsed.error.message);
      throw new Error(`Invalid event payload: ${parsed.error.message}`);
    }

    const event = parsed.data;
    await enqueueForDeal(redis, event);

    const acquired = await acquireDealLock(redis, event.deal_id);
    if (!acquired) {
      // Another worker is processing this deal; re-queue with slight delay
      await job.moveToDelayed(Date.now() + 200);
      return;
    }

    try {
      while (true) {
        const next = await peekNextDealEvent(redis, event.deal_id);
        if (!next) break;

        const streamEvent = await processSingleEvent(sql, next);
        if (streamEvent) {
          broadcaster.broadcast(streamEvent);
        }
        await popDealEvent(redis, event.deal_id, next);
      }
    } finally {
      await releaseDealLock(redis, event.deal_id);
    }
  };
}

async function processSingleEvent(sql: Sql, event: DealEvent): Promise<StreamEvent | null> {
  if (await isEventProcessed(sql, event.event_id)) {
    const recorded = await recordProcessedEvent(sql, event, "duplicate");
    return toStreamEvent(recorded);
  }

  try {
    await upsertDealFromEvent(sql, event);
    const recorded = await recordProcessedEvent(sql, event, "success");
    return toStreamEvent(recorded);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    await recordDeadLetter(sql, event, message, event.event_id, event.deal_id);
    const recorded = await recordProcessedEvent(sql, event, "error", message);
    return toStreamEvent(recorded);
  }
}

function toStreamEvent(record: {
  id: number;
  event_id: string;
  deal_id: string;
  type: string;
  stage: string | null;
  amount: number | null;
  close_date: string | null;
  occurred_at: string;
  processed_at: string;
  status: "success" | "error" | "duplicate";
  error_message: string | null;
  payload: Record<string, unknown> | null;
}): StreamEvent {
  return {
    id: record.id,
    event_id: record.event_id,
    deal_id: record.deal_id,
    type: record.type,
    stage: record.stage,
    amount: record.amount,
    close_date: record.close_date,
    occurred_at: record.occurred_at,
    processed_at: record.processed_at,
    status: record.status,
    error_message: record.error_message,
    payload: record.payload,
  };
}
