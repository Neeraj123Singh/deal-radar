# Loom Recording Script (~3 minutes)

Use this script when recording your submission walkthrough.

## Setup (before recording)
1. `docker compose up --build` — wait for all services healthy
2. `docker compose --profile with-generator up generator` — in second terminal
3. Open http://localhost:3000

## Script

### [0:00–0:30] Introduction
- "This is Deal Radar — a real-time AI co-pilot for sales teams."
- Show the dashboard: live activity stream on the left, deal health panel on the right.
- Point out the green "Live" indicator — events streaming via SSE.

### [0:30–1:15] Backend & Dirty Data
- Filter stream by event type (e.g., `stage_changed`).
- Pause and resume the stream — show it stops/starts cleanly.
- Click on **D-9903** (Closed-Won, no activity) in the stream.
- Click "Score Deal Health" — show the **refusal**: "Cannot score — zero logged activities."
- Highlight hygiene actions: "Log at least one customer interaction."

### [1:15–2:00] AI Layer & MEDDICC
- Click **D-9905** or **D-9906** (clean deals with notes).
- Score deal health — show the MEDDICC score, risk level, and reasoning.
- Mention: validation layer runs before LLM; system refuses to hallucinate on bad data.

### [2:00–2:30] Backend Infrastructure
- Open Bull Board: http://localhost:3001/admin/queues
- Show job queue, completed/failed counts.
- Mention: BullMQ + Redis FIFO, per-deal ordering, idempotency via event_id.
- Filter stream by "duplicate" status — show dedup working.

### [2:30–3:00] Architecture & Trade-offs
- "Built with Fastify, BullMQ, Postgres, Next.js, and OpenAI GPT-4o-mini."
- "Cut: chat UI, vector DB, virtualization — focused on the spine."
- "Works without OpenAI key via rule-based fallback."
- Show README and docs folder briefly.

## Tips
- Keep browser zoom at 100%
- Hide bookmarks bar
- Use dark mode (matches UI)
- Record at 1080p
