import clsx from "clsx";
import type { HealthInsight } from "@/lib/types";

interface Props {
  deals: HealthInsight[];
  loading: boolean;
  error: string | null;
  selectedDealId: string | null;
  onSelectDeal: (dealId: string) => void;
  onRefresh: () => void;
}

export function AtRiskPanel({
  deals,
  loading,
  error,
  selectedDealId,
  onSelectDeal,
  onRefresh,
}: Props) {
  const unscorable = deals.filter((d) => !d.scorable);
  const atRisk = deals.filter((d) => d.scorable && d.risk_level !== "low");

  return (
    <section className="border-b border-slate-700 bg-slate-900/40">
      <div className="px-4 py-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Pipeline At-Risk
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
        >
          {loading ? "Scanning…" : "Refresh"}
        </button>
      </div>

      <div className="px-4 pb-3 max-h-40 overflow-y-auto scrollbar-thin space-y-2">
        {error && <p className="text-xs text-red-300">{error}</p>}

        {!loading && !error && deals.length === 0 && (
          <p className="text-xs text-slate-500">No open deals yet — start the generator</p>
        )}

        {atRisk.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-amber-400 mb-1">
              At risk ({atRisk.length})
            </p>
            <ul className="space-y-1">
              {atRisk.map((deal) => (
                <AtRiskRow
                  key={deal.deal_id}
                  deal={deal}
                  selected={selectedDealId === deal.deal_id}
                  onSelect={onSelectDeal}
                />
              ))}
            </ul>
          </div>
        )}

        {unscorable.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              Needs hygiene ({unscorable.length})
            </p>
            <ul className="space-y-1">
              {unscorable.slice(0, 5).map((deal) => (
                <AtRiskRow
                  key={deal.deal_id}
                  deal={deal}
                  selected={selectedDealId === deal.deal_id}
                  onSelect={onSelectDeal}
                  unscorable
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function AtRiskRow({
  deal,
  selected,
  onSelect,
  unscorable = false,
}: {
  deal: HealthInsight;
  selected: boolean;
  onSelect: (dealId: string) => void;
  unscorable?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(deal.deal_id)}
        className={clsx(
          "w-full text-left rounded px-2 py-1.5 text-xs transition-colors",
          selected ? "bg-sky-500/20 border border-sky-500/30" : "hover:bg-slate-800/80 border border-transparent"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sky-300">{deal.deal_id}</span>
          {unscorable ? (
            <span className="text-amber-400">unscorable</span>
          ) : (
            <span className="text-slate-400">{deal.health_score}/100</span>
          )}
        </div>
        <p className="text-slate-500 truncate mt-0.5">{deal.summary}</p>
      </button>
    </li>
  );
}
