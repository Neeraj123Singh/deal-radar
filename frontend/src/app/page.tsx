"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { AtRiskPanel } from "@/components/AtRiskPanel";
import { EventRow } from "@/components/EventRow";
import { DealHealthPanel } from "@/components/DealHealthPanel";
import { useAtRiskDeals } from "@/hooks/useAtRiskDeals";
import { useEventStream } from "@/hooks/useEventStream";
import { useDealHealth } from "@/hooks/useDealHealth";
import { fetchJson } from "@/lib/api";
import { EVENT_TYPES, STATUS_FILTERS, type QueueStats } from "@/lib/types";

export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [atRiskRefreshKey, setAtRiskRefreshKey] = useState(0);

  const { events, connected, error: streamError, loading } = useEventStream({
    statusFilter: statusFilter || undefined,
    typeFilter: typeFilter || undefined,
    paused,
  });

  const {
    selectedDealId,
    detail,
    insight,
    loading: dealLoading,
    scoring,
    error: dealError,
    selectDeal,
    scoreDeal,
    clearSelection,
  } = useDealHealth();

  const {
    deals: atRiskDeals,
    loading: atRiskLoading,
    error: atRiskError,
    refresh: refreshAtRisk,
  } = useAtRiskDeals(atRiskRefreshKey);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await fetchJson<{ stats: QueueStats }>("/api/stats");
        setStats(data.stats);
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    const timer = setTimeout(() => setAtRiskRefreshKey((k) => k + 1), 3000);
    return () => clearTimeout(timer);
  }, [events.length]);

  const handleSelectDeal = (dealId: string) => {
    selectDeal(dealId);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Deal <span className="text-sky-400">Radar</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Real-time AI co-pilot for sales teams</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {stats && (
              <>
                <span>{stats.deal_count} deals</span>
                <span>{stats.total_events} events</span>
                <span className="text-emerald-400">{stats.success_count} ok</span>
                {stats.error_count > 0 && <span className="text-red-400">{stats.error_count} errors</span>}
                {stats.duplicate_count > 0 && <span className="text-amber-400">{stats.duplicate_count} dupes</span>}
              </>
            )}
            <span className={clsx("flex items-center gap-1.5", connected ? "text-emerald-400" : "text-slate-500")}>
              <span className={clsx("w-2 h-2 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-slate-600")} />
              {paused ? "Paused" : connected ? "Live" : "Connecting…"}
            </span>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Stream */}
        <div className="flex-1 flex flex-col border-r border-slate-700 min-w-0">
          {/* Filters toolbar */}
          <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">All statuses</option>
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">All types</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={clsx(
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                paused
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-slate-700 hover:bg-slate-600 text-slate-200"
              )}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>

            <span className="text-xs text-slate-500 ml-auto">
              Showing {events.length} events (max 500)
            </span>
          </div>

          {/* Event list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-slate-800/50">
            {loading && events.length === 0 && (
              <div className="flex items-center justify-center h-32 text-slate-500 text-sm animate-pulse">
                Loading events…
              </div>
            )}

            {!loading && events.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <p className="text-sm">No events yet</p>
                <p className="text-xs mt-1">Start the mock generator to see live activity</p>
              </div>
            )}

            {events.map((event) => (
              <EventRow
                key={event.event_id}
                event={event}
                selected={selectedDealId === event.deal_id}
                onSelect={handleSelectDeal}
              />
            ))}
          </div>

          {streamError && (
            <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-300">
              {streamError}
            </div>
          )}
        </div>

        {/* Deal Health Panel */}
        <div className="w-96 shrink-0 flex flex-col bg-slate-900/50">
          <AtRiskPanel
            deals={atRiskDeals}
            loading={atRiskLoading}
            error={atRiskError}
            selectedDealId={selectedDealId}
            onSelectDeal={handleSelectDeal}
            onRefresh={refreshAtRisk}
          />
          <DealHealthPanel
            deal={detail?.deal ?? null}
            insight={insight}
            loading={dealLoading}
            scoring={scoring}
            error={dealError}
            onScore={() => selectedDealId && scoreDeal(selectedDealId)}
            onClose={clearSelection}
          />
        </div>
      </div>
    </div>
  );
}
