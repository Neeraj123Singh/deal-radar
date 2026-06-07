# Assumptions & Decisions

Every assumption made during this take-home, with rationale. When something was ambiguous in the brief, we picked a direction, documented it, and moved on.

---

## Data & Domain Assumptions

### A1: Event schema extensions
**Assumption:** Added `deal_created` and `close_date_changed` event types beyond the brief's list.
**Why:** Needed to bootstrap deals and simulate the "close date pushed without stage change" dirty-data pattern.
**Impact:** Generator produces these types; backend accepts them.

### A2: `is_source_of_truth` defaults to `false`
**Assumption:** Events without the flag are treated as non-canonical.
**Why:** Safer default — require explicit truth claim rather than assume it.
**Impact:** Deals only become canonical when an event explicitly sets `is_source_of_truth: true`.

### A3: Activity types
**Assumption:** `email_sent`, `meeting_booked`, and `note_added` count as "activity." `stage_changed`, `close_date_changed`, and `deal_closed` do not.
**Why:** Matches sales CRM conventions — activity = customer interaction, not metadata changes.
**Impact:** D-9903 (Closed-Won, zero activities) is correctly flagged.

### A4: MEDDICC field detection via keyword matching
**Assumption:** MEDDICC fields are detected by searching deal notes and event payloads for keywords (e.g., "economic buyer", "champion", "metrics").
**Why:** We don't have structured MEDDICC fields in the CRM schema — only free-text notes.
**Impact:** A deal with no notes will always fail MEDDICC validation. This is intentional — it forces the hygiene enforcer to prompt note-taking.
**Trade-off:** Keyword matching is brittle vs. structured fields. Production would use CRM custom fields or NER.

### A5: Close date format
**Assumption:** Close dates are ISO date strings (`YYYY-MM-DD`), not timestamps.
**Why:** Matches the brief's sample data.
**Impact:** Timezone-agnostic date comparison for "close date mismatch" detection.

### A6: Deal ID is the deduplication key
**Assumption:** Duplicate deals share the same `deal_id` (not account_id or external_id).
**Why:** Brief says "duplicate accounts/deals exist with conflicting is_source_of_truth flags" using deal_id.
**Impact:** Source-of-truth resolution operates per deal_id.

---

## Backend Assumptions

### B1: Single webhook endpoint
**Assumption:** One endpoint (`POST /webhook/events`) handles all event types.
**Why:** Brief describes a single event stream, not per-source endpoints.
**Impact:** Salesforce and HubSpot events go to the same pipeline.

### B2: 202 Accepted for ingestion
**Assumption:** Webhook returns 202 (not 200) to signal async processing.
**Why:** Standard pattern for non-blocking ingestion; makes the contract explicit.

### B3: Per-deal lock TTL of 10 seconds
**Assumption:** A deal processing lock expires after 10s.
**Why:** Prevents deadlocks if a worker crashes mid-processing. 10s is generous for a single event upsert.
**Risk:** If processing takes >10s, another worker could interleave. Mitigated by sorted set ordering.

### B4: BullMQ jobId = event_id
**Assumption:** Using `event_id` as BullMQ `jobId` prevents duplicate jobs in the queue.
**Why:** BullMQ rejects jobs with duplicate jobIds by default.
**Limitation:** If the same event_id arrives with different payloads, the second is silently dropped at queue level (before our DB dedup catches it).

### B5: No authentication
**Assumption:** No auth on webhook or API endpoints.
**Why:** Take-home scope; single-user demo. Documented as a production gap.
**Production fix:** API key on webhook, JWT on frontend API.

### B6: Postgres over SQLite
**Assumption:** PostgreSQL for persistence.
**Why:** Brief preference; handles concurrent writes from 20 workers better than SQLite.

### B7: Raw SQL over ORM
**Assumption:** Direct SQL via `postgres.js` instead of Drizzle/Prisma migrations.
**Why:** Faster to ship for a take-home; the schema is small (5 tables). Trade-off: no type-safe query builder.

---

## Frontend Assumptions

### F1: Single-page dashboard (no routing)
**Assumption:** Everything on one page — stream + health panel side by side.
**Why:** Brief describes a co-pilot dashboard, not a multi-page app.

### F2: 500-event cap (not virtualization)
**Assumption:** Keep the 500 most recent events in memory rather than virtualizing the full list.
**Why:** Simpler implementation; achieves smooth performance for demo. Brief says "cap to most-recent-N" — this satisfies that.

### F3: Click event row to select deal (not separate deal list)
**Assumption:** Deal selection happens by clicking an event in the stream.
**Why:** Natural UX — "I see this event, tell me about this deal."

### F4: Dark theme
**Assumption:** Dark UI for a "radar" aesthetic.
**Why:** Purely aesthetic; no functional impact.

### F5: SSE over WebSocket
**Assumption:** Server-Sent Events for live updates.
**Why:** One-way push is sufficient; simpler protocol; auto-reconnect built in.
**Trade-off:** Can't send messages from client over the same channel (not needed here).

---

## AI Layer Assumptions

### AI1: MEDDICC is the sole methodology
**Assumption:** Only MEDDICC is implemented (not SPICED, BANT, etc.).
**Why:** Brief uses MEDDICC as the example. Methodology selection is hardcoded, not dynamic.
**Production:** Would detect deal stage/size/industry to pick methodology.

### AI2: Validation layer is deterministic; LLM is optional enhancement
**Assumption:** Rule-based validation always runs first. LLM only called if validation passes.
**Why:** Anti-hallucination requirement — the validation gate is non-negotiable.
**Impact:** System works fully without an OpenAI API key.

### AI3: GPT-4o-mini for scoring
**Assumption:** Use the cheapest capable model with JSON mode.
**Why:** Cost-effective for a take-home; JSON mode ensures structured output.
**Trade-off:** Less capable than GPT-4o for nuanced reasoning. Validation layer compensates.

### AI4: LLM cannot override validation refusal
**Assumption:** Even if the LLM returns `scorable: true`, we override to `false` if validation failed.
**Why:** Hard guard against hallucination. The LLM might ignore instructions; code won't.

### AI5: No vector DB / RAG
**Assumption:** Deal notes are short enough to include inline in the LLM prompt (last 5 notes, last 10 events).
**Why:** RAG adds infrastructure complexity disproportionate to the data volume in this slice.
**Production:** Would embed notes in a vector store for deals with hundreds of notes across long cycles.

### AI6: No chat interface
**Assumption:** Health scoring is triggered by clicking a deal, not by typing a question.
**Why:** Highest-value slice per brief guidance: "given a deal, produce a health score + grounded explanation."
**Cut:** "Which deals in my pipeline are at risk?" is available via API (`GET /api/insights/at-risk`) but not wired to a chat UI.

### AI7: Hygiene actions are prescriptive strings
**Assumption:** When scoring is refused, we return specific action items (e.g., "Log at least one customer interaction").
**Why:** Expert-level requirement — don't just refuse, tell the rep what to fix.

---

## Infrastructure Assumptions

### I1: Docker Compose for local dev
**Assumption:** `docker compose up` is the primary run path.
**Why:** Brief requirement.

### I2: Generator is optional (profile)
**Assumption:** Mock generator runs via `docker compose --profile with-generator up generator`.
**Why:** Separates core app from test data; reviewers can also POST events manually.

### I3: No CI/CD pipeline
**Assumption:** No GitHub Actions or similar.
**Why:** Out of scope; deployment docs describe how you'd add it.

### I4: No HTTPS
**Assumption:** HTTP only for local dev.
**Why:** Take-home; production deployment docs cover TLS termination.

---

## Known Limitations

1. **No multi-tenancy** — single rep, single pipeline
2. **No event replay** — can't reprocess historical events from a checkpoint
3. **MEDDICC keyword matching is naive** — production needs structured CRM fields
4. **No rate limiting** on webhook — would need it in production
5. **Lock TTL edge case** — very slow processing could cause ordering violations
6. **Frontend doesn't auto re-score on new events** — hygiene actions shown; manual re-score or refresh at-risk panel
7. **No persistent SSE reconnection backoff** — browser EventSource handles basic retry, but no custom logic

---

## What I'd Do With More Time

1. **Pipeline risk dashboard** — at-risk panel wired; could add trend charts over time
2. **Virtualized event list** — `react-window` for 10k+ events
3. **Structured MEDDICC fields** — CRM custom field mapping instead of keyword search
4. **Event replay** — reprocess from `processed_events` for debugging
5. **Chat interface** — natural language queries with tool-calling agent
6. **Auth** — API key on webhook, session on frontend
7. **Integration tests** — end-to-end test with dirty data scenarios
8. **Grafana dashboards** — queue depth, processing latency, error rates
