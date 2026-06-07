"use client";

import { useCallback, useState } from "react";
import { fetchJson } from "@/lib/api";
import type { DealState, HealthInsight, StreamEvent } from "@/lib/types";

interface DealDetail {
  deal: DealState;
  events: StreamEvent[];
  insight: HealthInsight | null;
}

export function useDealHealth() {
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [insight, setInsight] = useState<HealthInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectDeal = useCallback(async (dealId: string) => {
    setSelectedDealId(dealId);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<DealDetail>(`/api/deals/${dealId}`);
      setDetail(data);
      setInsight(data.insight);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const scoreDeal = useCallback(async (dealId: string) => {
    setScoring(true);
    setError(null);
    try {
      const data = await fetchJson<{ insight: HealthInsight }>(`/api/deals/${dealId}/health`);
      setInsight(data.insight);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scoring failed");
    } finally {
      setScoring(false);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDealId(null);
    setDetail(null);
    setInsight(null);
    setError(null);
  }, []);

  return {
    selectedDealId,
    detail,
    insight,
    loading,
    scoring,
    error,
    selectDeal,
    scoreDeal,
    clearSelection,
  };
}
