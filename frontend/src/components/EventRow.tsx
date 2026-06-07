import clsx from "clsx";
import type { StreamEvent } from "@/lib/types";

const TYPE_COLORS: Record<string, string> = {
  deal_created: "bg-blue-500/20 text-blue-300",
  stage_changed: "bg-purple-500/20 text-purple-300",
  email_sent: "bg-green-500/20 text-green-300",
  meeting_booked: "bg-cyan-500/20 text-cyan-300",
  note_added: "bg-yellow-500/20 text-yellow-300",
  close_date_changed: "bg-orange-500/20 text-orange-300",
  deal_closed: "bg-pink-500/20 text-pink-300",
};

const STATUS_COLORS: Record<string, string> = {
  success: "border-l-emerald-500",
  error: "border-l-red-500",
  duplicate: "border-l-amber-500",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

interface Props {
  event: StreamEvent;
  selected: boolean;
  onSelect: (dealId: string) => void;
}

export function EventRow({ event, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event.deal_id)}
      className={clsx(
        "w-full text-left px-4 py-3 border-l-2 transition-colors hover:bg-slate-800/60",
        STATUS_COLORS[event.status] ?? "border-l-slate-600",
        selected && "bg-slate-800/80 ring-1 ring-sky-500/40"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm text-sky-400 truncate">{event.deal_id}</span>
          <span className={clsx("text-xs px-2 py-0.5 rounded-full shrink-0", TYPE_COLORS[event.type] ?? "bg-slate-700 text-slate-300")}>
            {event.type.replace(/_/g, " ")}
          </span>
        </div>
        <span className="text-xs text-slate-500 shrink-0">{formatTime(event.processed_at)}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        {event.stage && <span>{event.stage}</span>}
        {event.amount != null && <span>{formatAmount(event.amount)}</span>}
        {event.status === "error" && (
          <span className="text-red-400 truncate">{event.error_message}</span>
        )}
        {event.status === "duplicate" && (
          <span className="text-amber-400">Duplicate delivery</span>
        )}
      </div>
    </button>
  );
}
