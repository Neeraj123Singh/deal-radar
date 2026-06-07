import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { Sql } from "../db/migrate.js";
import {
  getDeal,
  getDealEvents,
  getLatestHealthInsight,
  listDeals,
  listProcessedEvents,
  saveHealthInsight,
  getQueueStats,
} from "../db/queries.js";
import { DealEventSchema } from "../types.js";
import { EventBroadcaster, sseHandler } from "../services/sse.js";
import { buildDealContext, validateDealForScoring } from "../ai/validation.js";
import { scoreDealHealth, scoreAtRiskDeals } from "../ai/scoring.js";

export function registerRoutes(
  app: FastifyInstance,
  sql: Sql,
  queue: Queue,
  broadcaster: EventBroadcaster
): void {
  app.get("/health", async () => ({ status: "ok", sse_clients: broadcaster.clientCount }));

  app.post("/webhook/events", async (request, reply) => {
    const parsed = DealEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid event", details: parsed.error.flatten() });
    }

    const event = parsed.data;

    // Keep completed jobs in Redis so Bull Board can show history (last 1000)
    await queue.add("process-event", event, {
      jobId: event.event_id,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    });

    return reply.status(202).send({
      accepted: true,
      event_id: event.event_id,
      deal_id: event.deal_id,
    });
  });

  app.get("/api/events", async (request) => {
    const query = request.query as { limit?: string; status?: string; type?: string; deal_id?: string };
    const events = await listProcessedEvents(sql, {
      limit: parseInt(query.limit ?? "100", 10),
      status: query.status,
      type: query.type,
      dealId: query.deal_id,
    });
    return { events };
  });

  app.get("/api/deals", async (request) => {
    const query = request.query as { limit?: string };
    const deals = await listDeals(sql, parseInt(query.limit ?? "50", 10));
    return { deals };
  });

  app.get("/api/deals/:dealId", async (request, reply) => {
    const { dealId } = request.params as { dealId: string };
    const deal = await getDeal(sql, dealId);
    if (!deal) return reply.status(404).send({ error: "Deal not found" });

    const events = await getDealEvents(sql, dealId);
    const insight = await getLatestHealthInsight(sql, dealId);

    return { deal, events, insight };
  });

  app.get("/api/deals/:dealId/health", async (request, reply) => {
    const { dealId } = request.params as { dealId: string };
    const ctx = await buildDealContext(sql, dealId);
    if (!ctx) return reply.status(404).send({ error: "Deal not found" });

    const validation = validateDealForScoring(ctx);
    const insight = await scoreDealHealth(ctx, validation);
    await saveHealthInsight(sql, insight);

    return { insight, validation };
  });

  app.get("/api/insights/at-risk", async () => {
    const deals = await listDeals(sql, 100);
    const contexts = [];
    const validations = new Map<string, ReturnType<typeof validateDealForScoring>>();

    for (const deal of deals) {
      if (deal.stage === "Closed-Won" || deal.stage === "Closed-Lost") continue;
      const ctx = await buildDealContext(sql, deal.deal_id);
      if (!ctx) continue;
      const validation = validateDealForScoring(ctx);
      validations.set(deal.deal_id, validation);
      contexts.push(ctx);
    }

    const atRisk = await scoreAtRiskDeals(contexts, validations);
    return { deals: atRisk, count: atRisk.length };
  });

  app.get("/api/stats", async () => {
    const stats = await getQueueStats(sql);
    return { stats, sse_clients: broadcaster.clientCount };
  });

  app.get("/api/stream", async (request, reply) => {
    await sseHandler(broadcaster, request, reply);
  });
}
