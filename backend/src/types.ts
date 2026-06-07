import { z } from "zod";

export const DealStage = z.enum([
  "Discovery",
  "Qualification",
  "Negotiation",
  "Closed-Won",
  "Closed-Lost",
]);

export const EventType = z.enum([
  "deal_created",
  "stage_changed",
  "email_sent",
  "meeting_booked",
  "note_added",
  "close_date_changed",
  "deal_closed",
]);

export const DealEventSchema = z.object({
  event_id: z.string().min(1),
  deal_id: z.string().min(1),
  type: EventType,
  stage: DealStage.optional(),
  amount: z.number().optional(),
  close_date: z.string().optional(),
  source: z.enum(["salesforce", "hubspot"]).optional(),
  is_source_of_truth: z.boolean().optional(),
  occurred_at: z.string(),
  payload: z.record(z.unknown()).optional(),
});

export type DealEvent = z.infer<typeof DealEventSchema>;
export type DealStageType = z.infer<typeof DealStage>;
export type EventTypeValue = z.infer<typeof EventType>;

export interface DealState {
  deal_id: string;
  stage: DealStageType | null;
  amount: number | null;
  close_date: string | null;
  source: string | null;
  is_source_of_truth: boolean;
  last_activity_at: string | null;
  activity_count: number;
  updated_at: string;
}

export interface ProcessedEventRecord {
  id: number;
  event_id: string;
  deal_id: string;
  type: string;
  stage: string | null;
  amount: number | null;
  close_date: string | null;
  source: string | null;
  is_source_of_truth: boolean | null;
  occurred_at: string;
  processed_at: string;
  status: "success" | "error" | "duplicate";
  error_message: string | null;
  payload: Record<string, unknown> | null;
}

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
