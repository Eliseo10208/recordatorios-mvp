"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { components } from "@/lib/api-types";
import { authenticatedFetch } from "@/lib/reminder-client";

type Reminder = components["schemas"]["ReminderPublic"];
type Page = components["schemas"]["ReminderPage"];
export type ReminderFilter = "upcoming" | "fired" | "canceled";

export function useReminderFeed(filter: ReminderFilter, active: boolean) {
  const [items, setItems] = useState<Reminder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedFilter, setLoadedFilter] = useState<ReminderFilter | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const generation = useRef(0);
  const moreInFlight = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const current = ++generation.current;
    let firstInFlight = false;

    async function loadFirst(background: boolean) {
      if (firstInFlight || moreInFlight.current === current) return;
      firstInFlight = true;
      if (background) setRefreshing(true);
      try {
        const params = new URLSearchParams({ status: filter });
        const response = await authenticatedFetch(`/api/reminders?${params}`);
        if (!response.ok) throw new Error("list unavailable");
        const page = (await response.json()) as Page;
        if (generation.current !== current) return;
        setItems(page.items);
        setCursor(page.next_cursor);
        setError("");
      } catch {
        if (generation.current === current)
          setError("No se pudieron cargar tus recordatorios.");
      } finally {
        firstInFlight = false;
        if (generation.current === current) {
          setLoadedFilter(filter);
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    const initial = window.setTimeout(() => {
      setLoading(true);
      setLoadedFilter(null);
      setItems([]);
      setCursor(null);
      setError("");
      void loadFirst(false);
    }, 0);
    const timer = window.setInterval(() => void loadFirst(true), 15_000);
    return () => {
      generation.current = current + 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [active, filter, retryKey]);

  const loadMore = useCallback(async () => {
    if (!cursor || moreInFlight.current === generation.current) return;
    const current = generation.current;
    moreInFlight.current = current;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ status: filter, cursor });
      const response = await authenticatedFetch(`/api/reminders?${params}`);
      if (!response.ok) throw new Error("more unavailable");
      const page = (await response.json()) as Page;
      if (generation.current !== current) return;
      setItems((previous) => {
        const known = new Set(previous.map((item) => item.id));
        return [
          ...previous,
          ...page.items.filter((item) => !known.has(item.id)),
        ];
      });
      setCursor(page.next_cursor);
      setError("");
    } catch {
      if (generation.current === current)
        setError("No se pudieron cargar más recordatorios.");
    } finally {
      if (moreInFlight.current === current) moreInFlight.current = null;
      if (generation.current === current) setLoadingMore(false);
    }
  }, [cursor, filter]);

  const retry = useCallback(() => setRetryKey((value) => value + 1), []);
  return {
    items: loadedFilter === filter ? items : [],
    cursor: loadedFilter === filter ? cursor : null,
    loading: loading || loadedFilter !== filter,
    refreshing,
    loadingMore,
    error: loadedFilter === filter ? error : "",
    loadMore,
    retry,
  };
}
