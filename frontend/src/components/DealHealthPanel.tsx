import clsx from "clsx";
import type { DealState, HealthInsight } from "@/lib/types";

function RiskBadge({ level }: { level: HealthInsight["risk_level"] }) {
  const colors = {
    low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    high: "bg-red-500/20 text-red-300 border-red-500/30",
    unknown: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  };
  return (
    <span className={clsx("text-xs px-2 py-0.5 rounded border", colors[level])}>
      {level} risk
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "text-emerald-400" : score >= 45 ? "text-amber-400" : "text-red-400";
  return (
    <div className={clsx("text-4xl font-bold tabular-nums", color)}>
      {score}
      <span className="text-lg text-slate-500">/100</span>
    </div>
  );
}

interface Props {
  deal: DealState | null;
  insight: HealthInsight | null;
  loading: boolean;
  scoring: boolean;
  error: string | null;
  onScore: () => void;
  onClose: () => void;
}

export function DealHealthPanel({ deal, insight, loading, scoring, error, onScore, onClose }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="animate-pulse">Loading deal…</div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
        <div className="text-4xl mb-4 opacity-30">◎</div>
        <p className="text-sm">Select a deal from the activity stream to view health insights</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg text-sky-400">{deal.deal_id}</h2>
          <p className="text-sm text-slate-400 mt-0.5">{deal.stage ?? "Unknown stage"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 text-sm px-2 py-1"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {/* Deal snapshot */}
        <section className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Amount" value={deal.amount != null ? `$${deal.amount.toLocaleString()}` : "—"} />
          <Stat label="Close Date" value={deal.close_date ?? "—"} />
          <Stat label="Activities" value={String(deal.activity_count)} />
          <Stat label="Source" value={deal.source ?? "—"} />
          <Stat
            label="Source of Truth"
            value={deal.is_source_of_truth ? "Yes" : "No"}
            warn={!deal.is_source_of_truth}
          />
          <Stat
            label="Last Activity"
            value={deal.last_activity_at ? new Date(deal.last_activity_at).toLocaleDateString() : "None"}
            warn={!deal.last_activity_at}
          />
        </section>

        {/* Health insight */}
        <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">MEDDICC Health</h3>
            {insight && <RiskBadge level={insight.risk_level} />}
          </div>

          {!insight && (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400 mb-3">No health score yet</p>
              <button
                type="button"
                onClick={onScore}
                disabled={scoring}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
              >
                {scoring ? "Scoring…" : "Score Deal Health"}
              </button>
            </div>
          )}

          {insight && (
            <div className="space-y-3">
              {insight.scorable && insight.health_score != null ? (
                <div className="flex items-center gap-4">
                  <ScoreRing score={insight.health_score} />
                  <p className="text-sm text-slate-300 flex-1">{insight.summary}</p>
                </div>
              ) : (
                <div className="rounded bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-sm text-amber-200 font-medium mb-1">Cannot score this deal</p>
                  <p className="text-xs text-amber-300/80">{insight.summary}</p>
                </div>
              )}

              {insight.reasoning.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reasoning</h4>
                  <ul className="text-xs text-slate-300 space-y-1">
                    {insight.reasoning.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-slate-600">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insight.missing_fields.length > 0 && (
                <AlertList title="Missing Fields" items={insight.missing_fields} color="red" />
              )}

              {insight.data_quality_issues.length > 0 && (
                <AlertList title="Data Quality Issues" items={insight.data_quality_issues} color="amber" />
              )}

              {insight.hygiene_actions.length > 0 && (
                <AlertList title="Hygiene Actions Required" items={insight.hygiene_actions} color="sky" />
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                <span className="text-xs text-slate-500">
                  {insight.used_llm ? "LLM + validation layer" : "Rule-based (no API key)"}
                </span>
                <button
                  type="button"
                  onClick={onScore}
                  disabled={scoring}
                  className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
                >
                  {scoring ? "Re-scoring…" : "Re-score"}
                </button>
              </div>
            </div>
          )}
        </section>

        {error && (
          <div className="rounded bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded bg-slate-800/80 p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={clsx("text-sm font-medium mt-0.5", warn ? "text-amber-400" : "text-slate-200")}>
        {value}
      </div>
    </div>
  );
}

function AlertList({ title, items, color }: { title: string; items: string[]; color: "red" | "amber" | "sky" }) {
  const colors = {
    red: "text-red-300",
    amber: "text-amber-300",
    sky: "text-sky-300",
  };
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{title}</h4>
      <ul className={clsx("text-xs space-y-1", colors[color])}>
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span>→</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
