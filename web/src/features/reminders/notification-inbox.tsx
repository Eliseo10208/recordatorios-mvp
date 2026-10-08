"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LoadingCards } from "./loading-cards";
import type { components } from "@/lib/api-types";
import { authenticatedFetch } from "@/lib/reminder-client";

type Notice = components["schemas"]["NotificationPublic"];
type Page = components["schemas"]["NotificationPage"];

export function NotificationInbox({
  onCountChange,
  onOpenReminder,
}: {
  onCountChange: () => void;
  onOpenReminder: (id: string) => void;
}) {
  const [items, setItems] = useState<Notice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const generation = useRef(0);
  const moreInFlight = useRef<number | null>(null);
  const firstInFlight = useRef<number | null>(null);
  const markingRef = useRef(false);

  const load = useCallback(
    async (current: number, next?: string, background = false) => {
      if (
        (background && moreInFlight.current === current) ||
        (!next && firstInFlight.current === current)
      )
        return;
      if (next) {
        if (
          moreInFlight.current === current ||
          firstInFlight.current === current
        )
          return;
        moreInFlight.current = current;
        setLoadingMore(true);
      } else {
        firstInFlight.current = current;
        if (background) setRefreshing(true);
      }
      try {
        const response = await authenticatedFetch(
          `/api/notifications${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
        );
        if (!response.ok) throw new Error("inbox unavailable");
        const page = (await response.json()) as Page;
        if (generation.current !== current) return;
        setItems((previous) =>
          next
            ? [
                ...previous,
                ...page.items.filter(
                  (item) => !previous.some((known) => known.id === item.id),
                ),
              ]
            : page.items,
        );
        setCursor(page.next_cursor);
        setError("");
      } catch {
        if (generation.current === current)
          setError(
            next
              ? "No se pudieron cargar más avisos."
              : "No se pudieron cargar tus avisos.",
          );
      } finally {
        if (next && moreInFlight.current === current)
          moreInFlight.current = null;
        if (!next && firstInFlight.current === current)
          firstInFlight.current = null;
        if (generation.current === current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const current = ++generation.current;
    const initial = window.setTimeout(() => {
      setLoading(true);
      setItems([]);
      setCursor(null);
      setError("");
      void load(current);
    }, 0);
    const timer = window.setInterval(
      () => void load(current, undefined, true),
      15_000,
    );
    return () => {
      generation.current = current + 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load, retryKey]);

  async function markRead(id: string) {
    if (markingRef.current) return;
    markingRef.current = true;
    setMarking(id);
    try {
      const response = await authenticatedFetch(
        `/api/notifications/${id}/read`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("mark unavailable");
      setItems((previous) =>
        previous.map((item) =>
          item.id === id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
      onCountChange();
    } catch {
      setError("No se pudo marcar el aviso como leído.");
    } finally {
      markingRef.current = false;
      setMarking(null);
    }
  }

  async function markAllRead() {
    if (markingRef.current) return;
    markingRef.current = true;
    setMarking("all");
    try {
      const response = await authenticatedFetch("/api/notifications/read-all", {
        method: "POST",
      });
      if (!response.ok) throw new Error("mark unavailable");
      setItems((previous) =>
        previous.map((item) => ({
          ...item,
          read_at: new Date().toISOString(),
        })),
      );
      onCountChange();
    } catch {
      setError("No se pudieron marcar los avisos como leídos.");
    } finally {
      markingRef.current = false;
      setMarking(null);
    }
  }

  return (
    <section aria-labelledby="inbox-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BANDEJA INTERNA</p>
          <h2 id="inbox-heading">Tus avisos</h2>
        </div>
        {items.some((item) => !item.read_at) && (
          <button
            className="secondary-button"
            onClick={() => void markAllRead()}
            disabled={marking !== null}
          >
            {marking === "all" ? "Marcando…" : "Marcar todos como leídos"}
          </button>
        )}
      </div>
      {loading && <LoadingCards label="Cargando avisos" />}
      {refreshing && (
        <p className="field-hint" role="status">
          Actualizando avisos…
        </p>
      )}
      {error && (
        <div className="inline-feedback" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-mark" aria-hidden="true" />
          <h3>Todo al día</h3>
          <p>Los avisos aparecerán aquí cuando venza un recordatorio.</p>
        </div>
      )}
      <div className="reminder-list" aria-busy={loading}>
        {!loading &&
          items.map((item) => (
            <article
              className={`reminder-item ${item.read_at ? "" : "unread"}`}
              key={item.id}
            >
              <div>
                <p className="item-meta">
                  {item.read_at ? "Leído" : "Nuevo aviso"} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </p>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
              <div className="item-actions">
                <button
                  className="text-button"
                  onClick={() => onOpenReminder(item.reminder_id)}
                >
                  Ver recordatorio
                </button>
                {!item.read_at && (
                  <button
                    className="text-button"
                    onClick={() => void markRead(item.id)}
                    disabled={marking !== null}
                  >
                    {marking === item.id ? "Marcando…" : "Marcar leído"}
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {cursor && !loading && (
        <button
          className="secondary-button load-more"
          onClick={() => void load(generation.current, cursor)}
          disabled={loadingMore}
        >
          {loadingMore ? "Cargando más…" : "Cargar más avisos"}
        </button>
      )}
    </section>
  );
}
