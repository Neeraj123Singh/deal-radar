"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api";
import type { StreamEvent } from "@/lib/types";
import { MAX_STREAM_EVENTS } from "@/lib/types";

interface UseEventStreamOptions {
  statusFilter?: string;
  typeFilter?: string;
  paused: boolean;
}

export function useEventStream({ statusFilter, typeFilter, paused }: UseEventStreamOptions) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sourceRef = useRef<EventSource | null>(null);

  const appendEvent = useCallback((event: StreamEvent) => {
    setEvents((prev) => {
      if (prev.some((e) => e.event_id === event.event_id)) return prev;
      const next = [event, ...prev];
      return next.slice(0, MAX_STREAM_EVENTS);
    });
  }, []);

  // Initial load from REST
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        setLoading(true);
        const params = new URLSearchParams({ limit: "100" });
        if (statusFilter) params.set("status", statusFilter);
        if (typeFilter) params.set("type", typeFilter);
        const res = await fetch(getApiUrl(`/api/events?${params}`));
        if (!res.ok) throw new Error("Failed to load events");
        const data = (await res.json()) as { events: StreamEvent[] };
        if (!cancelled) {
          setEvents(data.events);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, typeFilter]);

  // SSE connection with clean teardown
  useEffect(() => {
    if (paused) {
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
      return;
    }

    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    const qs = params.toString();
    const url = getApiUrl(`/api/stream${qs ? `?${qs}` : ""}`);

    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
      setError(null);
    };

    source.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as StreamEvent | { type: string };
        if ("event_id" in data) appendEvent(data);
      } catch {
        // ignore parse errors (heartbeats)
      }
    };

    source.onerror = () => {
      setConnected(false);
      setError("Stream disconnected — will retry automatically");
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [paused, statusFilter, typeFilter, appendEvent]);

  return { events, connected, error, loading };
}
