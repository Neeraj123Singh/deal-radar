import type { Sql } from "../db/migrate.js";
import { getDeal, getDealEvents, getDealNotes } from "../db/queries.js";
import type { DealState, HealthInsight } from "../types.js";

/** MEDDICC fields we require before scoring */
const MEDDICC_REQUIRED = [
  { key: "metrics", label: "Metrics (quantified business impact)" },
  { key: "economic_buyer", label: "Economic Buyer identified" },
  { key: "decision_criteria", label: "Decision Criteria documented" },
  { key: "decision_process", label: "Decision Process mapped" },
  { key: "identify_pain", label: "Identified Pain documented" },
  { key: "champion", label: "Champion identified" },
] as const;

export interface DealContext {
  deal: DealState;
  events: { type: string; occurred_at: string; payload: Record<string, unknown> | null }[];
  notes: { note: string; occurred_at: string }[];
}

export interface ValidationResult {
  scorable: boolean;
  missing_fields: string[];
  data_quality_issues: string[];
  hygiene_actions: string[];
}

export async function buildDealContext(sql: Sql, dealId: string): Promise<DealContext | null> {
  const deal = await getDeal(sql, dealId);
  if (!deal) return null;

  const events = await getDealEvents(sql, dealId, 30);
  const notes = await getDealNotes(sql, dealId);

  return {
    deal,
    events: events.map((e) => ({
      type: e.type,
      occurred_at: e.occurred_at,
      payload: e.payload,
    })),
    notes,
  };
}

export function validateDealForScoring(ctx: DealContext): ValidationResult {
  const missing_fields: string[] = [];
  const data_quality_issues: string[] = [];
  const hygiene_actions: string[] = [];

  const { deal } = ctx;

  // Core deal fields
  if (!deal.stage) {
    missing_fields.push("stage");
    hygiene_actions.push("Set the deal stage in your CRM");
  }
  if (deal.amount == null) {
    missing_fields.push("amount");
    hygiene_actions.push("Add deal amount/value to the CRM record");
  }
  if (!deal.close_date) {
    missing_fields.push("close_date");
    hygiene_actions.push("Set an expected close date");
  }

  // Activity hygiene — the brief's dirty-data catch
  if (deal.activity_count === 0) {
    data_quality_issues.push("No activity history (no emails, calls, or meetings logged)");
    hygiene_actions.push("Log at least one customer interaction (email, call, or meeting)");
  }

  // Closed-Won with no activity is a red flag from the brief
  if (deal.stage === "Closed-Won" && deal.activity_count === 0) {
    data_quality_issues.push(
      "Deal marked Closed-Won but has zero logged activities — cannot verify win legitimacy"
    );
  }

  // Close date sanity: Discovery with imminent close date
  if (deal.stage === "Discovery" && deal.close_date) {
    const daysUntilClose =
      (new Date(deal.close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilClose < 14 && daysUntilClose > 0) {
      data_quality_issues.push(
        `Discovery-stage deal with close date in ${Math.round(daysUntilClose)} days — stage/close-date mismatch`
      );
      hygiene_actions.push("Update stage to match close timeline, or push close date out");
    }
  }

  // Stale activity
  if (deal.last_activity_at) {
    const daysSinceActivity =
      (Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity > 90 && deal.stage !== "Closed-Won" && deal.stage !== "Closed-Lost") {
      data_quality_issues.push(`Last activity was ${Math.round(daysSinceActivity)} days ago`);
    }
  } else if (deal.stage && !["Closed-Won", "Closed-Lost"].includes(deal.stage)) {
    data_quality_issues.push("Open deal with no recorded last activity date");
  }

  // MEDDICC fields extracted from notes (structured check)
  const allNoteText = ctx.notes.map((n) => n.note.toLowerCase()).join(" ");
  const fieldAliases: Record<(typeof MEDDICC_REQUIRED)[number]["key"], string[]> = {
    metrics: ["metrics"],
    economic_buyer: ["economic buyer", "economic_buyer"],
    decision_criteria: ["decision criteria", "decision_criteria"],
    decision_process: ["decision process", "decision_process"],
    identify_pain: ["identify pain", "identify_pain", "identified pain"],
    champion: ["champion"],
  };
  for (const field of MEDDICC_REQUIRED) {
    const aliases = fieldAliases[field.key];
    const found =
      aliases.some((alias) => allNoteText.includes(alias)) ||
      ctx.events.some((e) =>
        aliases.some((alias) => JSON.stringify(e.payload ?? {}).toLowerCase().includes(alias))
      );
    if (!found) {
      missing_fields.push(field.label);
      hygiene_actions.push(`Document ${field.label} in deal notes`);
    }
  }

  // Source of truth conflicts
  if (!deal.is_source_of_truth) {
    data_quality_issues.push(
      "This record is not marked as source of truth — duplicate CRM records may exist"
    );
    hygiene_actions.push("Resolve duplicate deal records and mark the canonical one as source of truth");
  }

  const scorable =
    missing_fields.length === 0 &&
    data_quality_issues.filter((i) => i.includes("zero logged") || i.includes("Closed-Won")).length === 0;

  return { scorable, missing_fields, data_quality_issues, hygiene_actions };
}

export function ruleBasedScore(ctx: DealContext, validation: ValidationResult): HealthInsight {
  const { deal } = ctx;
  const now = new Date().toISOString();

  if (!validation.scorable) {
    return {
      deal_id: deal.deal_id,
      scorable: false,
      health_score: null,
      risk_level: "unknown",
      methodology: "MEDDICC",
      summary: `Cannot score ${deal.deal_id}: insufficient or unreliable data.`,
      reasoning: [
        ...validation.missing_fields.map((f) => `Missing: ${f}`),
        ...validation.data_quality_issues,
      ],
      missing_fields: validation.missing_fields,
      data_quality_issues: validation.data_quality_issues,
      hygiene_actions: validation.hygiene_actions,
      scored_at: now,
      used_llm: false,
    };
  }

  let score = 70;
  const reasoning: string[] = [];

  // Stage progression signals
  const stageScores: Record<string, number> = {
    Discovery: 40,
    Qualification: 55,
    Negotiation: 75,
    "Closed-Won": 95,
    "Closed-Lost": 10,
  };
  if (deal.stage) {
    score = stageScores[deal.stage] ?? score;
    reasoning.push(`Stage "${deal.stage}" baseline: ${stageScores[deal.stage] ?? score}/100`);
  }

  // Activity recency bonus/penalty
  if (deal.last_activity_at) {
    const days = (Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 7) {
      score += 10;
      reasoning.push("Recent activity within 7 days (+10)");
    } else if (days <= 30) {
      score += 5;
      reasoning.push("Activity within 30 days (+5)");
    } else if (days > 60) {
      score -= 15;
      reasoning.push(`Stale activity (${Math.round(days)} days ago, -15)`);
    }
  }

  // Activity volume
  if (deal.activity_count >= 5) {
    score += 5;
    reasoning.push(`Strong engagement: ${deal.activity_count} logged activities (+5)`);
  } else if (deal.activity_count <= 1) {
    score -= 10;
    reasoning.push("Minimal activity logged (-10)");
  }

  // Close date pressure
  if (deal.close_date && deal.stage === "Negotiation") {
    const daysToClose =
      (new Date(deal.close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysToClose < 0) {
      score -= 20;
      reasoning.push("Close date has passed (-20)");
    } else if (daysToClose <= 14) {
      score += 5;
      reasoning.push("Close date within 2 weeks in Negotiation (+5 urgency signal)");
    }
  }

  score = Math.max(0, Math.min(100, score));

  const risk_level: HealthInsight["risk_level"] =
    score >= 70 ? "low" : score >= 45 ? "medium" : "high";

  return {
    deal_id: deal.deal_id,
    scorable: true,
    health_score: score,
    risk_level,
    methodology: "MEDDICC",
    summary: `${deal.deal_id} health score: ${score}/100 (${risk_level} risk)`,
    reasoning,
    missing_fields: [],
    data_quality_issues: validation.data_quality_issues,
    hygiene_actions: validation.hygiene_actions,
    scored_at: now,
    used_llm: false,
  };
}
