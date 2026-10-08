import type { components } from "@/lib/api-types";

import { getReminderUrgency } from "./reminder-urgency";

type Reminder = components["schemas"]["ReminderPublic"];

const urgencyLabels = {
  urgent: "Vence en menos de 1 h",
  soon: "Vence en menos de 24 h",
  later: "Con tiempo",
} as const;

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15.5 5.5 3 3M4 20l4.3-.9L19 8.4a2.1 2.1 0 0 0-3-3L5.3 16.1 4 20Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function ReminderCard({
  item,
  statusLabel,
  timeLabel,
  whatsappLabel,
  now,
  onOpen,
}: {
  item: Reminder;
  statusLabel: string;
  timeLabel: string;
  whatsappLabel: string | null;
  now: number;
  onOpen: (edit: boolean) => void;
}) {
  const urgency = getReminderUrgency(item.status, item.scheduled_at_utc, now);
  const canEdit = item.status === "scheduled";

  return (
    <article
      className={`reminder-item reminder-card reminder-card--${urgency}`}
    >
      <div className="reminder-card-content">
        <p className="item-meta">
          <time dateTime={item.scheduled_at_utc}>{timeLabel}</time>
        </p>
        <h3>{item.message}</h3>
        <div className="reminder-badges">
          <span className="status-pill">{statusLabel}</span>
          {urgency !== "neutral" && (
            <span className="urgency-pill">{urgencyLabels[urgency]}</span>
          )}
        </div>
        {whatsappLabel && (
          <p className="item-meta reminder-channel">
            WhatsApp: {whatsappLabel}
          </p>
        )}
      </div>
      <button
        type="button"
        className="card-icon-button"
        aria-label={`${canEdit ? "Editar" : "Ver detalle de"} ${item.message}`}
        title={canEdit ? "Editar recordatorio" : "Ver detalle"}
        onClick={() => onOpen(canEdit)}
      >
        {canEdit ? <PencilIcon /> : <EyeIcon />}
      </button>
    </article>
  );
}
