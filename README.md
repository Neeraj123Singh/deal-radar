# Deal Radar

A real-time AI co-pilot for sales teams. Ingests messy CRM event streams, processes them through a FIFO queue with per-deal ordering, streams results live to a React dashboard, and scores deal health using MEDDICC — refusing to hallucinate on bad data.

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Optional: add OPENAI_API_KEY for LLM-powered scoring

# 2. Start everything
docker compose up --build

# 3. Start the mock event generator (separate terminal)
docker compose --profile with-generator up generator

# 4. Open the app
open http://localhost:3000
```

**Services:**
| Service    | URL                                      |
|------------|------------------------------------------|
| Frontend   | http://localhost:3000                    |
| Backend    | http://localhost:3001                    |
| Bull Board | http://localhost:3001/admin/queues     |
| Postgres   | localhost:5432                           |
| Redis      | localhost:6379                           |

## Local Development (without Docker)

```bash
# Terminal 1 — infrastructure
docker compose up postgres redis

# Terminal 2 — backend
cd backend && npm install && npm run dev

# Terminal 3 — frontend
cd frontend && npm install && npm run dev

# Terminal 4 — generator
cd generator && npm install && npm run dev
```

## What Was Built

### Backend ✅
- `POST /webhook/events` — non-blocking ingestion (returns 202 immediately)
- BullMQ + Redis FIFO queue between ingestion and processing
- Per-deal ordering via Redis sorted sets + distributed locks
- Idempotency via `event_id` unique constraint + BullMQ `jobId`
- Source-of-truth resolution for duplicate CRM records
- PostgreSQL persistence (deals, events, notes, health insights, dead-letter queue)
- SSE live stream at `GET /api/stream`
- Bull Board at `/admin/queues` for queue observability
- Dead-letter table for poison events

### Frontend ✅
- Real-time Activity Stream with SSE auto-updates
- Filter by status (success/error/duplicate) and event type
- Pause/Resume with clean `useEffect` teardown (no leaks)
- Deal Health panel — click any event to inspect deal + AI insight
- Capped to 500 most recent events for performance
- Empty, loading, and error states

### AI Layer ✅
- MEDDICC validation layer that **refuses to score** dirty deals
- Detects: zero activity, Closed-Won with no history, stage/close-date mismatches, missing MEDDICC fields, duplicate source-of-truth conflicts
- Hygiene enforcer: returns actionable prompts to fix data before scoring
- OpenAI GPT-4o-mini integration (optional — rule-based fallback without API key)
- Hard guard: validation layer overrides LLM if it tries to score garbage

## What Was Cut (and Why)

| Feature | Reason |
|---------|--------|
| WebSocket (used SSE instead) | SSE is simpler, sufficient for one-way push, easier to proxy |
| Virtualized list (react-window) | 500-event cap achieves same goal with less complexity |
| Vector DB / RAG for notes | Notes are short; keyword extraction in validation layer is sufficient for this slice |
| Multi-user auth | Out of scope for take-home; single-rep dashboard |
| Chat UI for natural language queries | Focused on highest-value path: click deal → get health score |
| Kubernetes / Terraform | Documented deployment path instead (see `docs/DEPLOYMENT.md`) |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

```
Webhook → BullMQ Queue → Per-deal Redis ZSET → Worker → Postgres → SSE → React UI
                                                              ↓
                                                    AI Validation → LLM (optional)
```

## Assumptions & Trade-offs

See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) for every assumption made.

## AI Layer Design

See [docs/AI_LAYER.md](docs/AI_LAYER.md) for the insight pipeline architecture and anti-hallucination strategy.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment options.

## How I Used AI Tools

Built primarily with **Cursor** (this IDE's AI agent). AI was used for:
- Scaffolding the monorepo structure and boilerplate
- Drafting the MEDDICC validation rules and prompt engineering
- Generating the dirty-data mock event generator
- Writing documentation

**What I learned about the AI layer this week:**
The critical insight is that the LLM is the *last* step, not the first. A validation/sanity layer must gate the LLM — otherwise it will confidently score a Closed-Won deal with zero activity. The "expert" pattern is hygiene enforcement: don't just refuse, tell the rep exactly what to fix and tie it back to the live stream. Prompt engineering alone is insufficient; you need structured checks on the data before the model ever sees it.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhook/events` | Ingest CRM event (202 Accepted) |
| GET | `/api/events` | List processed events |
| GET | `/api/deals` | List all deals |
| GET | `/api/deals/:id` | Deal detail + events + cached insight |
| GET | `/api/deals/:id/health` | Score deal health (MEDDICC) |
| GET | `/api/insights/at-risk` | Pipeline at-risk deals |
| GET | `/api/stream` | SSE live event stream |
| GET | `/api/stats` | Queue/event statistics |
| GET | `/admin/queues` | Bull Board UI |

## License

MIT — take-home submission for Overpath.
# deal-radar
