"use client";

import { useEffect, useRef, useState } from "react";

import type { components } from "@/lib/api-types";
import { authenticatedFetch } from "@/lib/reminder-client";

type Reminder = components["schemas"]["ReminderPublic"];
type Preview = components["schemas"]["SchedulePreview"];

function initialClock() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return {
    day: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    hour: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

export function ReminderForm({
  initial,
  whatsappAvailable,
  whatsappState,
  onSaved,
  onClose,
}: {
  initial?: Reminder;
  whatsappAvailable: boolean;
  whatsappState: "loading" | "ready" | "error";
  onSaved: (reminder: Reminder) => void;
  onClose: () => void;
}) {
  const [clock] = useState(initialClock);
  const [message, setMessage] = useState(initial?.message ?? "");
  const [sendWhatsApp, setSendWhatsApp] = useState(
    initial?.send_whatsapp ?? false,
  );
  const [localDate, setLocalDate] = useState(initial?.local_date ?? clock.day);
  const [localTime, setLocalTime] = useState(initial?.local_time ?? clock.hour);
  const [timezone, setTimezone] = useState(
    initial?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC",
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewState, setPreviewState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const key = useRef<{ fingerprint: string; value: string } | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const reset = window.setTimeout(() => setPreviewState("loading"), 0);
    if (!localDate || !localTime || !timezone) {
      return () => window.clearTimeout(reset);
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await authenticatedFetch("/api/reminders/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            local_date: localDate,
            local_time: localTime,
            timezone,
          }),
        });
        if (!active) return;
        if (!response.ok) {
          setError("Elige una fecha futura y una zona horaria válida.");
          setPreviewState("error");
          return;
        }
        setPreview((await response.json()) as Preview);
        setPreviewState("ready");
        setError("");
      } catch {
        if (active) {
          setError("No se pudo calcular la hora del aviso.");
          setPreviewState("error");
        }
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(reset);
      window.clearTimeout(timer);
    };
  }, [localDate, localTime, timezone]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      savingRef.current ||
      !preview ||
      previewState !== "ready" ||
      !message.trim() ||
      message.trim().length > 280
    )
      return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const body = {
      message: message.trim(),
      local_date: localDate,
      local_time: localTime,
      timezone,
      send_whatsapp: sendWhatsApp,
    };
    const fingerprint = JSON.stringify(body);
    if (!key.current || key.current.fingerprint !== fingerprint) {
      key.current = { fingerprint, value: crypto.randomUUID() };
    }
    try {
      const response = await authenticatedFetch(
        initial ? `/api/reminders/${initial.id}` : "/api/reminders",
        {
          method: initial ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(initial ? {} : { "Idempotency-Key": key.current.value }),
          },
          body: JSON.stringify(
            initial ? { ...body, expected_version: initial.version } : body,
          ),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? "Este recordatorio cambió. Actualiza la página antes de continuar."
            : "No se pudo guardar el recordatorio.",
        );
        return;
      }
      onSaved((await response.json()) as Reminder);
    } catch {
      setError("No se pudo contactar al servicio. Inténtalo de nuevo.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="reminder-form" onSubmit={save}>
      <label htmlFor="reminder-message">¿Qué necesitas recordar?</label>
      <textarea
        id="reminder-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={280}
        required
        rows={3}
        placeholder="Por ejemplo: pagar la tarjeta"
      />
      <span className="field-hint">{message.length}/280 caracteres</span>
      <label className="checkbox-label" htmlFor="reminder-whatsapp">
        <input
          id="reminder-whatsapp"
          type="checkbox"
          checked={sendWhatsApp}
          disabled={!whatsappAvailable}
          onChange={(event) => setSendWhatsApp(event.target.checked)}
        />
        Enviar también una copia por WhatsApp
      </label>
      {whatsappState === "loading" && (
        <span className="field-hint" role="status">
          Consultando disponibilidad de WhatsApp…
        </span>
      )}
      {whatsappState === "error" && (
        <span className="field-hint">
          No se pudo comprobar WhatsApp. Revisa la sección WhatsApp.
        </span>
      )}
      {whatsappState === "ready" && !whatsappAvailable && (
        <span className="field-hint">
          Configura tu número en WhatsApp para activar este canal.
        </span>
      )}
      <div className="form-grid">
        <div>
          <label htmlFor="reminder-date">Fecha</label>
          <input
            id="reminder-date"
            type="date"
            value={localDate}
            onChange={(event) => {
              setLocalDate(event.target.value);
              setPreview(null);
            }}
            required
          />
        </div>
        <div>
          <label htmlFor="reminder-time">Hora</label>
          <input
            id="reminder-time"
            type="time"
            value={localTime}
            onChange={(event) => {
              setLocalTime(event.target.value);
              setPreview(null);
            }}
            required
          />
        </div>
      </div>
      <label htmlFor="reminder-zone">Zona horaria IANA</label>
      <input
        id="reminder-zone"
        value={timezone}
        onChange={(event) => {
          setTimezone(event.target.value);
          setPreview(null);
        }}
        required
      />
      <div className="preview-slot" aria-live="polite">
        {previewState === "loading" && (
          <div className="schedule-preview" role="status">
            Calculando horario…
          </div>
        )}
        {previewState === "ready" && preview && (
          <div className="schedule-preview" role="status">
            <strong>
              Te avisaremos el {preview.local_date} a las {preview.local_time}
            </strong>
            <span>
              {preview.timezone} · Dentro de la app
              {sendWhatsApp ? " y por WhatsApp" : ""}
            </span>
            {preview.resolution === "gap_forward" && (
              <span>
                La hora elegida no existe; se ajustó al primer instante válido.
              </span>
            )}
            {preview.resolution === "overlap_later" && (
              <span>Esta hora ocurre dos veces; se usará la segunda.</span>
            )}
          </div>
        )}
      </div>
      <div className="feedback-slot" aria-live="polite">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          disabled={saving}
        >
          Volver
        </button>
        <button
          type="submit"
          disabled={
            !preview || previewState !== "ready" || !message.trim() || saving
          }
        >
          {saving
            ? "Guardando…"
            : initial
              ? "Guardar cambios"
              : "Guardar recordatorio"}
        </button>
      </div>
    </form>
  );
}
