import type { Sql } from "./migrate.js";
import type { DealEvent, DealState, HealthInsight, ProcessedEventRecord, StreamEvent } from "../types.js";

const ACTIVITY_TYPES = new Set(["email_sent", "meeting_booked", "note_added"]);

export async function isEventProcessed(sql: Sql, eventId: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM processed_events WHERE event_id = ${eventId}) AS exists
  `;
  return rows[0]?.exists ?? false;
}

export async function recordProcessedEvent(
  sql: Sql,
  event: DealEvent,
  status: "success" | "error" | "duplicate",
  errorMessage?: string
): Promise<ProcessedEventRecord> {
  const rows = await sql<ProcessedEventRecord[]>`
    INSERT INTO processed_events (
      event_id, deal_id, type, stage, amount, close_date, source,
      is_source_of_truth, occurred_at, status, error_message, payload
    ) VALUES (
      ${event.event_id},
      ${event.deal_id},
      ${event.type},
      ${event.stage ?? null},
      ${event.amount ?? null},
      ${event.close_date ?? null},
      ${event.source ?? null},
      ${event.is_source_of_truth ?? null},
      ${event.occurred_at},
      ${status},
      ${errorMessage ?? null},
      ${sql.json((event.payload ?? {}) as Parameters<typeof sql.json>[0])}
    )
    ON CONFLICT (event_id) DO UPDATE SET status = EXCLUDED.status
    RETURNING *
  `;
  return rows[0]!;
}

export async function getDeal(sql: Sql, dealId: string): Promise<DealState | null> {
  const rows = await sql<DealState[]>`
    SELECT deal_id, stage, amount::float8 AS amount, close_date, source,
           is_source_of_truth, last_activity_at::text, activity_count,
           updated_at::text
    FROM deals WHERE deal_id = ${dealId}
  `;
  return rows[0] ?? null;
}

export async function upsertDealFromEvent(sql: Sql, event: DealEvent): Promise<DealState> {
  const isActivity = ACTIVITY_TYPES.has(event.type);
  const occurredAt = event.occurred_at;
  const rankBoost = event.is_source_of_truth ? 100 : 0;

  await sql`
    INSERT INTO deals (
      deal_id, stage, amount, close_date, source, is_source_of_truth,
      last_activity_at, activity_count, canonical_rank, updated_at
    ) VALUES (
      ${event.deal_id},
      ${event.stage ?? null},
      ${event.amount ?? null},
      ${event.close_date ?? null},
      ${event.source ?? null},
      ${event.is_source_of_truth ?? false},
      ${isActivity ? occurredAt : null},
      ${isActivity ? 1 : 0},
      ${rankBoost},
      NOW()
    )
    ON CONFLICT (deal_id) DO UPDATE SET
      stage = CASE
        WHEN EXCLUDED.canonical_rank > deals.canonical_rank THEN EXCLUDED.stage
        WHEN EXCLUDED.canonical_rank = deals.canonical_rank
          AND EXCLUDED.updated_at >= deals.updated_at THEN COALESCE(EXCLUDED.stage, deals.stage)
        ELSE deals.stage
      END,
      amount = CASE
        WHEN EXCLUDED.canonical_rank > deals.canonical_rank THEN EXCLUDED.amount
        WHEN EXCLUDED.canonical_rank = deals.canonical_rank THEN COALESCE(EXCLUDED.amount, deals.amount)
        ELSE deals.amount
      END,
      close_date = CASE
        WHEN EXCLUDED.canonical_rank > deals.canonical_rank THEN EXCLUDED.close_date
        WHEN EXCLUDED.canonical_rank = deals.canonical_rank THEN COALESCE(EXCLUDED.close_date, deals.close_date)
        ELSE deals.close_date
      END,
      source = CASE
        WHEN EXCLUDED.canonical_rank > deals.canonical_rank THEN EXCLUDED.source
        WHEN EXCLUDED.canonical_rank = deals.canonical_rank THEN COALESCE(EXCLUDED.source, deals.source)
        ELSE deals.source
      END,
      is_source_of_truth = CASE
        WHEN EXCLUDED.canonical_rank > deals.canonical_rank THEN EXCLUDED.is_source_of_truth
        WHEN EXCLUDED.canonical_rank = deals.canonical_rank AND EXCLUDED.is_source_of_truth THEN true
        ELSE deals.is_source_of_truth
      END,
      canonical_rank = GREATEST(deals.canonical_rank, EXCLUDED.canonical_rank),
      last_activity_at = CASE
        WHEN ${isActivity} THEN GREATEST(deals.last_activity_at, ${occurredAt}::timestamptz)
        ELSE deals.last_activity_at
      END,
      activity_count = deals.activity_count + ${isActivity ? 1 : 0},
      updated_at = NOW()
  `;

  if (event.type === "note_added" && event.payload?.note) {
    await sql`
      INSERT INTO deal_notes (deal_id, note, source, occurred_at)
      VALUES (
        ${event.deal_id},
        ${String(event.payload.note)},
        ${event.source ?? null},
        ${occurredAt}
      )
    `;
  }

  const deal = await getDeal(sql, event.deal_id);
  return deal!;
}

export async function listDeals(sql: Sql, limit = 50): Promise<DealState[]> {
  return sql<DealState[]>`
    SELECT deal_id, stage, amount::float8 AS amount, close_date, source,
           is_source_of_truth, last_activity_at::text, activity_count,
           updated_at::text
    FROM deals
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
}

export async function listProcessedEvents(
  sql: Sql,
  opts: { limit?: number; status?: string; type?: string; dealId?: string } = {}
): Promise<StreamEvent[]> {
  const { limit = 100, status, type, dealId } = opts;

  return sql<StreamEvent[]>`
    SELECT id, event_id, deal_id, type, stage, amount::float8 AS amount,
           close_date, occurred_at::text, processed_at::text, status,
           error_message, payload
    FROM processed_events
    WHERE 1=1
      ${status ? sql`AND status = ${status}` : sql``}
      ${type ? sql`AND type = ${type}` : sql``}
      ${dealId ? sql`AND deal_id = ${dealId}` : sql``}
    ORDER BY processed_at DESC
    LIMIT ${limit}
  `;
}

export async function getDealEvents(sql: Sql, dealId: string, limit = 50): Promise<StreamEvent[]> {
  return listProcessedEvents(sql, { dealId, limit });
}

export async function getDealNotes(sql: Sql, dealId: string): Promise<{ note: string; occurred_at: string }[]> {
  return sql<{ note: string; occurred_at: string }[]>`
    SELECT note, occurred_at::text FROM deal_notes
    WHERE deal_id = ${dealId}
    ORDER BY occurred_at DESC
    LIMIT 20
  `;
}

export async function saveHealthInsight(sql: Sql, insight: HealthInsight): Promise<void> {
  await sql`
    INSERT INTO health_insights (
      deal_id, scorable, health_score, risk_level, methodology, summary,
      reasoning, missing_fields, data_quality_issues, hygiene_actions, used_llm
    ) VALUES (
      ${insight.deal_id},
      ${insight.scorable},
      ${insight.health_score},
      ${insight.risk_level},
      ${insight.methodology},
      ${insight.summary},
      ${sql.json(insight.reasoning)},
      ${sql.json(insight.missing_fields)},
      ${sql.json(insight.data_quality_issues)},
      ${sql.json(insight.hygiene_actions)},
      ${insight.used_llm}
    )
  `;
}

export async function getLatestHealthInsight(sql: Sql, dealId: string): Promise<HealthInsight | null> {
  const rows = await sql<{
    deal_id: string;
    scorable: boolean;
    health_score: number | null;
    risk_level: string;
    methodology: string;
    summary: string;
    reasoning: string[];
    missing_fields: string[];
    data_quality_issues: string[];
    hygiene_actions: string[];
    used_llm: boolean;
    scored_at: string;
  }[]>`
    SELECT deal_id, scorable, health_score, risk_level, methodology, summary,
           reasoning, missing_fields, data_quality_issues, hygiene_actions,
           used_llm, scored_at::text
    FROM health_insights
    WHERE deal_id = ${dealId}
    ORDER BY scored_at DESC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    risk_level: row.risk_level as HealthInsight["risk_level"],
    methodology: "MEDDICC",
  };
}

export async function recordDeadLetter(
  sql: Sql,
  payload: unknown,
  errorMessage: string,
  eventId?: string,
  dealId?: string
): Promise<void> {
  await sql`
    INSERT INTO dead_letter_events (event_id, deal_id, raw_payload, error_message)
    VALUES (
      ${eventId ?? null},
      ${dealId ?? null},
      ${sql.json(payload as Parameters<typeof sql.json>[0])},
      ${errorMessage}
    )
  `;
}

export async function getQueueStats(sql: Sql): Promise<{
  total_events: number;
  success_count: number;
  error_count: number;
  duplicate_count: number;
  dead_letter_count: number;
  deal_count: number;
}> {
  const [stats] = await sql<{
    total_events: number;
    success_count: number;
    error_count: number;
    duplicate_count: number;
  }[]>`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
      COUNT(*) FILTER (WHERE status = 'error')::int AS error_count,
      COUNT(*) FILTER (WHERE status = 'duplicate')::int AS duplicate_count
    FROM processed_events
  `;

  const [dlq] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM dead_letter_events
  `;

  const [deals] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM deals
  `;

  return {
    ...stats!,
    dead_letter_count: dlq?.count ?? 0,
    deal_count: deals?.count ?? 0,
  };
}
