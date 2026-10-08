"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

import { NotificationInbox } from "@/features/reminders/notification-inbox";
import { LoadingCards } from "@/features/reminders/loading-cards";
import { ReminderForm } from "@/features/reminders/reminder-form";
import { useReminderFeed } from "@/features/reminders/use-reminder-feed";
import { WhatsAppSettings } from "@/features/reminders/whatsapp-settings";
import type { components } from "@/lib/api-types";
import { authenticatedFetch } from "@/lib/reminder-client";

type Profile = components["schemas"]["UserPublic"];
type Reminder = components["schemas"]["ReminderPublic"];
type Destination = components["schemas"]["DestinationPublic"];
type Status = "upcoming" | "fired" | "canceled";
type View = "list" | "form" | "detail" | "inbox" | "settings";

const labels: Record<Status, string> = {
  upcoming: "Próximos",
  fired: "Disparados",
  canceled: "Cancelados",
};

function displayTime(item: Reminder): string {
  return `${item.local_date} · ${item.local_time} · ${item.timezone}`;
}

function whatsappLabel(item: Reminder): string {
  const labels: Record<NonNullable<Reminder["whatsapp_status"]>, string> = {
    pending: "Pendiente",
    sending: "Enviando",
    accepted: "Aceptado por el servicio; entrega no confirmada",
    failed: "Falló",
    unknown: "Resultado desconocido; no se reenviará",
    canceled: "Cancelado",
  };
  return item.whatsapp_status ? labels[item.whatsapp_status] : "programado";
}

export function DashboardClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>("list");
  const [status, setStatus] = useState<Status>("upcoming");
  const feed = useReminderFeed(status, view === "list");
  const [selected, setSelected] = useState<Reminder | null>(null);
  const [editing, setEditing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [destinationState, setDestinationState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [destinationRetry, setDestinationRetry] = useState(0);
  const [verificationNotice, setVerificationNotice] = useState("");

  const loadCount = useCallback(async () => {
    try {
      const response = await authenticatedFetch(
        "/api/notifications/unread-count",
      );
      if (response.ok) {
        const data =
          (await response.json()) as components["schemas"]["UnreadCount"];
        setUnread(data.count);
      }
    } catch {
      // The inbox shows its own error when opened.
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const response = await authenticatedFetch("/api/account/me");
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("profile unavailable");
        if (active) setProfile((await response.json()) as Profile);
      } catch {
        if (active) setError("No se pudo cargar tu cuenta.");
      }
    }
    const initial = window.setTimeout(() => {
      void loadProfile();
      void loadCount();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initial);
    };
  }, [loadCount, router]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadCount(), 15_000);
    return () => window.clearInterval(timer);
  }, [loadCount]);

  useEffect(() => {
    let active = true;
    async function loadDestination() {
      try {
        const response = await authenticatedFetch(
          "/api/notification-settings/whatsapp",
        );
        if (!response.ok) throw new Error("destination unavailable");
        if (active) {
          setDestination((await response.json()) as Destination);
          setDestinationState("ready");
        }
      } catch {
        if (active) setDestinationState("error");
      }
    }
    const initial = window.setTimeout(() => void loadDestination(), 0);
    return () => {
      active = false;
      window.clearTimeout(initial);
    };
  }, [destinationRetry]);

  async function openReminder(id: string) {
    try {
      const response = await authenticatedFetch(`/api/reminders/${id}`);
      if (!response.ok) throw new Error("not found");
      setSelected((await response.json()) as Reminder);
      setView("detail");
      setError("");
    } catch {
      setError("No se pudo abrir este recordatorio.");
    }
  }

  async function cancelReminder() {
    if (!selected) return;
    setWorking(true);
    try {
      const response = await authenticatedFetch(
        `/api/reminders/${selected.id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expected_version: selected.version }),
        },
      );
      if (!response.ok) throw new Error("cancel unavailable");
      setSelected((await response.json()) as Reminder);
      setStatus("canceled");
      setError("");
    } catch {
      setError(
        "No se pudo cancelar. Actualiza el recordatorio e inténtalo de nuevo.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function logout() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/account/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout unavailable");
      await signOut({ callbackUrl: "/login" });
    } catch {
      setError("No se pudo cerrar sesión. Inténtalo de nuevo.");
      setWorking(false);
    }
  }

  async function resendVerification() {
    setWorking(true);
    setVerificationNotice("");
    try {
      const response = await fetch("/api/account/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("unavailable");
      setVerificationNotice(
        "Si el envío está disponible, recibirás un enlace de verificación.",
      );
    } catch {
      setVerificationNotice(
        "No se pudo solicitar el enlace. Inténtalo después.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" /> Recordatorios
        </div>
        <nav className="dashboard-nav" aria-label="Navegación principal">
          <button
            className={`text-button ${view === "list" || view === "form" || view === "detail" ? "active" : ""}`}
            aria-pressed={
              view === "list" || view === "form" || view === "detail"
            }
            onClick={() => setView("list")}
          >
            Mis recordatorios
          </button>
          <button
            className={`text-button ${view === "inbox" ? "active" : ""}`}
            aria-pressed={view === "inbox"}
            onClick={() => setView("inbox")}
          >
            Avisos ({unread})
          </button>
          <button
            className={`text-button ${view === "settings" ? "active" : ""}`}
            aria-pressed={view === "settings"}
            onClick={() => setView("settings")}
          >
            WhatsApp
          </button>
          <button
            className="text-button"
            onClick={() => void logout()}
            disabled={working}
          >
            Cerrar sesión
          </button>
        </nav>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-intro">
          <p className="eyebrow">TU ESPACIO</p>
          <h1>Lo importante, a su tiempo.</h1>
          {profile && (
            <p className="muted">Sesión activa para {profile.email}</p>
          )}
          {profile && !profile.email_verified && (
            <div className="notice">
              <p>Tu correo está pendiente de verificación.</p>
              <button
                type="button"
                onClick={() => void resendVerification()}
                disabled={working}
              >
                Reenviar enlace
              </button>
              {verificationNotice && <p role="status">{verificationNotice}</p>}
            </div>
          )}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {view === "list" && (
          <section aria-labelledby="reminders-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">TU AGENDA</p>
                <h2 id="reminders-heading">Recordatorios</h2>
              </div>
              <button
                onClick={() => {
                  setEditing(false);
                  setView("form");
                }}
              >
                Añadir recordatorio
              </button>
            </div>
            <div
              className="status-tabs"
              role="group"
              aria-label="Filtrar recordatorios"
            >
              {(Object.keys(labels) as Status[]).map((key) => (
                <button
                  key={key}
                  className={key === status ? "active" : ""}
                  onClick={() => setStatus(key)}
                  aria-pressed={key === status}
                >
                  {labels[key]}
                </button>
              ))}
            </div>
            {feed.loading && <LoadingCards label="Cargando recordatorios" />}
            {feed.refreshing && (
              <p className="field-hint" role="status">
                Actualizando recordatorios…
              </p>
            )}
            {feed.error && (
              <div className="inline-feedback" role="alert">
                <p>{feed.error}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={feed.retry}
                >
                  Reintentar
                </button>
              </div>
            )}
            {!feed.loading && !feed.error && feed.items.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-mark" aria-hidden="true" />
                <h3>
                  {status === "upcoming"
                    ? "Todavía no tienes recordatorios"
                    : `No hay recordatorios ${labels[status].toLowerCase()}`}
                </h3>
                <p>Organiza tu próximo aviso en un momento.</p>
                {status === "upcoming" && (
                  <button
                    onClick={() => {
                      setEditing(false);
                      setView("form");
                    }}
                  >
                    Crear mi primer recordatorio
                  </button>
                )}
              </div>
            )}
            <div className="reminder-list" aria-busy={feed.loading}>
              {!feed.loading &&
                feed.items.map((item) => (
                  <article className="reminder-item" key={item.id}>
                    <div>
                      <p className="item-meta">{displayTime(item)}</p>
                      <h3>{item.message}</h3>
                      <p className="status-pill">
                        {item.status === "processing"
                          ? "En proceso"
                          : labels[status]}
                      </p>
                      {(item.send_whatsapp || item.whatsapp_status) && (
                        <p className="item-meta">
                          WhatsApp: {whatsappLabel(item)}
                        </p>
                      )}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => void openReminder(item.id)}
                    >
                      Ver detalle
                    </button>
                  </article>
                ))}
            </div>
            {feed.cursor && !feed.loading && (
              <button
                className="secondary-button load-more"
                onClick={() => void feed.loadMore()}
                disabled={feed.loadingMore}
              >
                {feed.loadingMore ? "Cargando más…" : "Cargar más"}
              </button>
            )}
          </section>
        )}

        {view === "form" && (
          <section className="panel" aria-labelledby="form-heading">
            <p className="eyebrow">PROGRAMAR</p>
            <h2 id="form-heading">
              {editing ? "Editar recordatorio" : "Nuevo recordatorio"}
            </h2>
            <ReminderForm
              initial={editing ? (selected ?? undefined) : undefined}
              whatsappAvailable={Boolean(destination?.active)}
              whatsappState={destinationState}
              onClose={() => setView(editing ? "detail" : "list")}
              onSaved={(item) => {
                setSelected(item);
                setView("detail");
                void loadCount();
              }}
            />
          </section>
        )}

        {view === "detail" && selected && (
          <section className="panel" aria-labelledby="detail-heading">
            <p className="eyebrow">DETALLE DEL AVISO</p>
            <h2 id="detail-heading">{selected.message}</h2>
            <p className="muted">{displayTime(selected)}</p>
            <p className="status-pill">
              Estado:{" "}
              {selected.status === "processing"
                ? "En proceso"
                : selected.status}
            </p>
            <p className="field-hint">
              Versión {selected.version} · Dentro de la app
            </p>
            {(selected.send_whatsapp || selected.whatsapp_status) && (
              <p className="field-hint">
                WhatsApp: {whatsappLabel(selected)} ·{" "}
                {destination?.masked_number ?? "número desactivado"}
              </p>
            )}
            <div className="form-actions">
              <button
                className="secondary-button"
                onClick={() => setView("list")}
              >
                Volver a la lista
              </button>
              {selected.status === "scheduled" && (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEditing(true);
                      setView("form");
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => void cancelReminder()}
                    disabled={working}
                  >
                    Cancelar recordatorio
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {view === "inbox" && (
          <NotificationInbox
            onCountChange={() => void loadCount()}
            onOpenReminder={(id) => void openReminder(id)}
          />
        )}
        {view === "settings" && destinationState === "loading" && (
          <LoadingCards label="Cargando WhatsApp" />
        )}
        {view === "settings" && destinationState === "error" && (
          <div className="inline-feedback" role="alert">
            <p>No se pudo cargar la configuración de WhatsApp.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setDestinationState("loading");
                setDestinationRetry((value) => value + 1);
              }}
            >
              Reintentar
            </button>
          </div>
        )}
        {view === "settings" && destinationState === "ready" && (
          <WhatsAppSettings
            destination={destination}
            onChange={setDestination}
            onClose={() => setView("list")}
          />
        )}
      </div>
    </main>
  );
}
