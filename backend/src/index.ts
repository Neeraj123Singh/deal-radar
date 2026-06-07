import Fastify from "fastify";
import cors from "@fastify/cors";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { config } from "./config.js";
import { migrate, createDb } from "./db/migrate.js";
import { createEventQueue, createEventWorker, getRedisConnection } from "./queue/index.js";
import { createEventProcessor } from "./services/eventProcessor.js";
import { EventBroadcaster } from "./services/sse.js";
import { registerRoutes } from "./routes/index.js";

async function main() {
  await migrate();

  const sql = createDb();
  const redis = getRedisConnection();
  const queue = createEventQueue();
  const broadcaster = new EventBroadcaster();

  const worker = createEventWorker(createEventProcessor(sql, redis, broadcaster));

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] Processed event ${job.data.event_id} for deal ${job.data.deal_id}`);
  });

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.corsOrigin });

  // Bull Board for queue observability
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath("/admin/queues");
  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });
  await app.register(serverAdapter.registerPlugin(), { prefix: "/admin/queues" });

  registerRoutes(app, sql, queue, broadcaster);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[server] Deal Radar backend listening on :${config.port}`);
  console.log(`[server] Bull Board: http://localhost:${config.port}/admin/queues`);
}

main().catch((err) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
