-- Deal Radar schema
-- Run via migrate.ts on startup

CREATE TABLE IF NOT EXISTS processed_events (
  id              SERIAL PRIMARY KEY,
  event_id        TEXT NOT NULL UNIQUE,
  deal_id         TEXT NOT NULL,
  type            TEXT NOT NULL,
  stage           TEXT,
  amount          NUMERIC,
  close_date      TEXT,
  source          TEXT,
  is_source_of_truth BOOLEAN,
  occurred_at     TIMESTAMPTZ NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'success',
  error_message   TEXT,
  payload         JSONB
);

CREATE INDEX IF NOT EXISTS idx_processed_events_deal_id ON processed_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_processed_events_occurred_at ON processed_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_processed_events_status ON processed_events(status);

CREATE TABLE IF NOT EXISTS deals (
  deal_id              TEXT PRIMARY KEY,
  stage                TEXT,
  amount               NUMERIC,
  close_date           TEXT,
  source               TEXT,
  is_source_of_truth   BOOLEAN NOT NULL DEFAULT false,
  last_activity_at     TIMESTAMPTZ,
  activity_count       INTEGER NOT NULL DEFAULT 0,
  canonical_rank       INTEGER NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON deals(updated_at DESC);

CREATE TABLE IF NOT EXISTS deal_notes (
  id          SERIAL PRIMARY KEY,
  deal_id     TEXT NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  source      TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_notes_deal_id ON deal_notes(deal_id);

CREATE TABLE IF NOT EXISTS health_insights (
  id                  SERIAL PRIMARY KEY,
  deal_id             TEXT NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  scorable            BOOLEAN NOT NULL,
  health_score        INTEGER,
  risk_level          TEXT NOT NULL,
  methodology         TEXT NOT NULL DEFAULT 'MEDDICC',
  summary             TEXT NOT NULL,
  reasoning           JSONB NOT NULL DEFAULT '[]',
  missing_fields      JSONB NOT NULL DEFAULT '[]',
  data_quality_issues JSONB NOT NULL DEFAULT '[]',
  hygiene_actions     JSONB NOT NULL DEFAULT '[]',
  used_llm            BOOLEAN NOT NULL DEFAULT false,
  scored_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_insights_deal_id ON health_insights(deal_id);

CREATE TABLE IF NOT EXISTS dead_letter_events (
  id            SERIAL PRIMARY KEY,
  event_id      TEXT,
  deal_id       TEXT,
  raw_payload   JSONB NOT NULL,
  error_message TEXT NOT NULL,
  failed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
