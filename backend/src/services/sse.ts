import type { FastifyReply, FastifyRequest } from "fastify";
import type { StreamEvent } from "../types.js";

type SseClient = {
  id: string;
  reply: FastifyReply;
  filters: { status?: string; type?: string };
};

export class EventBroadcaster {
  private clients = new Map<string, SseClient>();
  private clientCounter = 0;

  addClient(reply: FastifyReply, filters: { status?: string; type?: string } = {}): string {
    const id = `client-${++this.clientCounter}`;
    this.clients.set(id, { id, reply, filters });

    reply.raw.on("close", () => {
      this.clients.delete(id);
    });

    return id;
  }

  broadcast(event: StreamEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const [id, client] of this.clients) {
      if (client.filters.status && client.filters.status !== event.status) continue;
      if (client.filters.type && client.filters.type !== event.type) continue;
      try {
        client.reply.raw.write(payload);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export async function sseHandler(
  broadcaster: EventBroadcaster,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { status?: string; type?: string };
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const filters = {
    status: query.status,
    type: query.type,
  };

  broadcaster.addClient(reply, filters);

  reply.raw.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  // Keep connection alive
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  reply.raw.on("close", () => clearInterval(heartbeat));

  await new Promise<void>(() => {
    // Connection stays open until client disconnects
  });
}
