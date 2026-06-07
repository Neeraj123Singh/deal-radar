"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";
import type { HealthInsight } from "@/lib/types";

export function useAtRiskDeals(refreshKey = 0) {
  const [deals, setDeals] = useState<HealthInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchJson<{ deals: HealthInsight[]; count: number }>("/api/insights/at-risk");
      setDeals(data.deals);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load at-risk deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return { deals, loading, error, refresh };
}
