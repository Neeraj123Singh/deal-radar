export interface StreamEvent {
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
}

export interface DealState {
  deal_id: string;
  stage: string | null;
  amount: number | null;
  close_date: string | null;
  source: string | null;
  is_source_of_truth: boolean;
  last_activity_at: string | null;
  activity_count: number;
  updated_at: string;
}

export interface HealthInsight {
  deal_id: string;
  scorable: boolean;
  health_score: number | null;
  risk_level: "low" | "medium" | "high" | "unknown";
  methodology: "MEDDICC";
  summary: string;
  reasoning: string[];
  missing_fields: string[];
  data_quality_issues: string[];
  hygiene_actions: string[];
  scored_at: string;
  used_llm: boolean;
}

export interface QueueStats {
  total_events: number;
  success_count: number;
  error_count: number;
  duplicate_count: number;
  dead_letter_count: number;
  deal_count: number;
}

export const EVENT_TYPES = [
  "deal_created",
  "stage_changed",
  "email_sent",
  "meeting_booked",
  "note_added",
  "close_date_changed",
  "deal_closed",
] as const;

export const STATUS_FILTERS = ["success", "error", "duplicate"] as const;

export const MAX_STREAM_EVENTS = 500;
