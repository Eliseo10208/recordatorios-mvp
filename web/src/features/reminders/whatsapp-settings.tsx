"use client";

import { useState } from "react";

import type { components } from "@/lib/api-types";
import { authenticatedFetch } from "@/lib/reminder-client";

type Destination = components["schemas"]["DestinationPublic"];

export function WhatsAppSettings({
  destination,
  onChange,
  onClose,
}: {
  destination: Destination | null;
  onChange: (value: Destination) => void;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) return;
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        "/api/notification-settings/whatsapp",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, consent: true }),
        },
      );
      if (!response.ok) throw new Error(String(response.status));
      onChange((await response.json()) as Destination);
      setPhone("");
      setConsent(false);
    } catch {
      setError(
        "No se pudo guardar el número. Revisa el formato E.164 y vuelve a intentarlo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        "/api/notification-settings/whatsapp",
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(String(response.status));
      const refreshed = await authenticatedFetch(
        "/api/notification-settings/whatsapp",
      );
      if (!refreshed.ok) throw new Error(String(refreshed.status));
      onChange((await refreshed.json()) as Destination);
    } catch {
      setError("No se pudo desactivar WhatsApp. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="whatsapp-heading">
      <p className="eyebrow">CANAL OPCIONAL</p>
      <h2 id="whatsapp-heading">Avisos por WhatsApp</h2>
      <p className="muted">El aviso dentro de la app seguirá disponible.</p>
      {destination?.active && (
        <p role="status">Número activo: {destination.masked_number}</p>
      )}
      {!destination?.available && (
        <p className="notice">
          Este canal aún no está configurado en el servidor.
        </p>
      )}
      {destination?.available && (
        <form className="reminder-form" onSubmit={(event) => void save(event)}>
          <label htmlFor="whatsapp-phone">Número con código de país</label>
          <input
            id="whatsapp-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+525512345678"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
          <label className="checkbox-label" htmlFor="whatsapp-consent">
            <input
              id="whatsapp-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              required
            />
            {destination.consent_text}
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={busy || !consent}>
              Guardar número
            </button>
            {destination.active && (
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={() => void disable()}
              >
                Desactivar WhatsApp
              </button>
            )}
          </div>
        </form>
      )}
      <button type="button" className="secondary-button" onClick={onClose}>
        Volver
      </button>
    </section>
  );
}
