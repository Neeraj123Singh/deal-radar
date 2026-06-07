import OpenAI from "openai";
import { config } from "../config.js";
import type { DealContext, ValidationResult } from "./validation.js";
import type { HealthInsight } from "../types.js";
import { ruleBasedScore } from "./validation.js";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openai) openai = new OpenAI({ apiKey: config.openaiApiKey });
  return openai;
}

export async function scoreDealHealth(
  ctx: DealContext,
  validation: ValidationResult
): Promise<HealthInsight> {
  // Always refuse if validation says not scorable
  if (!validation.scorable) {
    return ruleBasedScore(ctx, validation);
  }

  const client = getOpenAI();
  if (!client) {
    return ruleBasedScore(ctx, validation);
  }

  try {
    const llmInsight = await scoreWithLLM(client, ctx, validation);
    return llmInsight;
  } catch (err) {
    console.warn("[ai] LLM scoring failed, falling back to rules:", err);
    return ruleBasedScore(ctx, validation);
  }
}

async function scoreWithLLM(
  client: OpenAI,
  ctx: DealContext,
  validation: ValidationResult
): Promise<HealthInsight> {
  const { deal, events, notes } = ctx;

  const systemPrompt = `You are Deal Radar, a sales co-pilot using MEDDICC methodology.
You MUST only use the structured deal data provided. Never invent activities, contacts, or metrics.
If data is missing or unreliable, set scorable=false and explain what's missing.
Return valid JSON only with this schema:
{
  "scorable": boolean,
  "health_score": number | null,
  "risk_level": "low" | "medium" | "high" | "unknown",
  "summary": string,
  "reasoning": string[],
  "missing_fields": string[],
  "data_quality_issues": string[],
  "hygiene_actions": string[]
}`;

  const userPrompt = `Score this deal using MEDDICC:

Deal ID: ${deal.deal_id}
Stage: ${deal.stage ?? "unknown"}
Amount: ${deal.amount ?? "unknown"}
Close Date: ${deal.close_date ?? "unknown"}
Source: ${deal.source ?? "unknown"}
Source of Truth: ${deal.is_source_of_truth}
Activity Count: ${deal.activity_count}
Last Activity: ${deal.last_activity_at ?? "none"}

Recent Events (${events.length}):
${events.slice(0, 10).map((e) => `- [${e.occurred_at}] ${e.type}: ${JSON.stringify(e.payload ?? {})}`).join("\n")}

Notes (${notes.length}):
${notes.slice(0, 5).map((n) => `- [${n.occurred_at}] ${n.note}`).join("\n") || "No notes"}

Pre-validation flags:
Missing: ${validation.missing_fields.join(", ") || "none"}
Quality issues: ${validation.data_quality_issues.join("; ") || "none"}

IMPORTANT: If activity_count is 0 or deal is Closed-Won with no activity, you MUST refuse to score (scorable=false).`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 800,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const parsed = JSON.parse(content) as Partial<HealthInsight>;

  // Hard guard: never allow LLM to override validation refusal
  if (!validation.scorable) {
    return ruleBasedScore(ctx, validation);
  }

  return {
    deal_id: deal.deal_id,
    scorable: parsed.scorable ?? true,
    health_score: parsed.health_score ?? null,
    risk_level: (parsed.risk_level as HealthInsight["risk_level"]) ?? "unknown",
    methodology: "MEDDICC",
    summary: parsed.summary ?? "LLM assessment complete",
    reasoning: parsed.reasoning ?? [],
    missing_fields: parsed.missing_fields ?? [],
    data_quality_issues: [
      ...validation.data_quality_issues,
      ...(parsed.data_quality_issues ?? []),
    ],
    hygiene_actions: [
      ...validation.hygiene_actions,
      ...(parsed.hygiene_actions ?? []),
    ],
    scored_at: new Date().toISOString(),
    used_llm: true,
  };
}

export async function scoreAtRiskDeals(
  contexts: DealContext[],
  validations: Map<string, ValidationResult>
): Promise<HealthInsight[]> {
  const results: HealthInsight[] = [];

  for (const ctx of contexts) {
    const validation = validations.get(ctx.deal.deal_id)!;
    const insight = await scoreDealHealth(ctx, validation);
    if (insight.scorable && insight.risk_level !== "low") {
      results.push(insight);
    } else if (!insight.scorable) {
      results.push(insight);
    }
  }

  return results.sort((a, b) => {
    if (!a.scorable && b.scorable) return -1;
    if (a.scorable && !b.scorable) return 1;
    return (a.health_score ?? 0) - (b.health_score ?? 0);
  });
}
