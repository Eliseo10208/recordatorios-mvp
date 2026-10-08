"use client";

import { useEffect, useRef, useState } from "react";

import type { components } from "@/lib/api-types";

type Reminder = components["schemas"]["ReminderPublic"];

export function ReminderDetail({
  item,
  timeLabel,
  whatsappLabel,
  maskedNumber,
  working,
  onBack,
  onEdit,
  onCancel,
  onDelete,
}: {
  item: Reminder;
  timeLabel: string;
  whatsappLabel: string;
  maskedNumber?: string | null;
  working: boolean;
  onBack: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  return (
    <section className="panel" aria-labelledby="detail-heading">
      <p className="eyebrow">DETALLE DEL AVISO</p>
      <h2 id="detail-heading">{item.message}</h2>
      <p className="muted">{timeLabel}</p>
      <p className="status-pill">
        Estado: {item.status === "processing" ? "En proceso" : item.status}
      </p>
      <p className="field-hint">Versión {item.version} · Dentro de la app</p>
      {(item.send_whatsapp || item.whatsapp_status) && (
        <p className="field-hint">
          WhatsApp: {whatsappLabel} · {maskedNumber ?? "número desactivado"}
        </p>
      )}
      <div className="form-actions">
        <button className="secondary-button" onClick={onBack}>
          Volver a la lista
        </button>
        {item.status === "scheduled" && (
          <>
            <button className="secondary-button" onClick={onEdit}>
              Editar
            </button>
            <button
              className="danger-button"
              onClick={onCancel}
              disabled={working}
            >
              Cancelar recordatorio
            </button>
          </>
        )}
        {item.status !== "processing" && !confirming && (
          <button
            ref={deleteRef}
            className="danger-button"
            onClick={() => setConfirming(true)}
            disabled={working}
          >
            Eliminar recordatorio
          </button>
        )}
      </div>
      {confirming && (
        <div
          className="reminder-delete-confirm"
          role="group"
          aria-label="Confirmar eliminación"
        >
          <p>El recordatorio y sus avisos desaparecerán de tu cuenta.</p>
          <div className="form-actions">
            <button
              ref={confirmRef}
              className="danger-button"
              onClick={onDelete}
              disabled={working}
            >
              Sí, eliminar
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setConfirming(false);
                window.setTimeout(() => deleteRef.current?.focus(), 0);
              }}
              disabled={working}
            >
              Conservar recordatorio
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
