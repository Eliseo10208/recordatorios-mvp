"use client";

import { useCallback, useEffect, useState } from "react";

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

  const load = useCallback(async (next?: string) => {
    try {
      const response = await authenticatedFetch(
        `/api/notifications${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (!response.ok) throw new Error("inbox unavailable");
      const page = (await response.json()) as Page;
      setItems((previous) =>
        next ? [...previous, ...page.items] : page.items,
      );
      setCursor(page.next_cursor);
      setError("");
    } catch {
      setError("No se pudieron cargar tus avisos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  async function markRead(id: string) {
    const response = await authenticatedFetch(`/api/notifications/${id}/read`, {
      method: "POST",
    });
    if (!response.ok) {
      setError("No se pudo marcar el aviso como leído.");
      return;
    }
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item,
      ),
    );
    onCountChange();
  }

  async function markAllRead() {
    const response = await authenticatedFetch("/api/notifications/read-all", {
      method: "POST",
    });
    if (!response.ok) {
      setError("No se pudieron marcar los avisos como leídos.");
      return;
    }
    setItems((previous) =>
      previous.map((item) => ({ ...item, read_at: new Date().toISOString() })),
    );
    onCountChange();
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
          >
            Marcar todos como leídos
          </button>
        )}
      </div>
      {loading && (
        <p className="muted" role="status">
          Cargando avisos…
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && items.length === 0 && (
        <div className="empty-state">
          <span aria-hidden="true">✦</span>
          <h3>Todo al día</h3>
          <p>Los avisos aparecerán aquí cuando venza un recordatorio.</p>
        </div>
      )}
      <div className="reminder-list">
        {items.map((item) => (
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
                >
                  Marcar leído
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {cursor && (
        <button
          className="secondary-button load-more"
          onClick={() => void load(cursor)}
        >
          Cargar más avisos
        </button>
      )}
    </section>
  );
}
