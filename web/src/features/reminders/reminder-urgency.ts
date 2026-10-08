type ReminderStatus = "scheduled" | "processing" | "fired" | "canceled";

export type ReminderUrgency = "urgent" | "soon" | "later" | "neutral";

const HOUR = 60 * 60 * 1000;

export function getReminderUrgency(
  status: ReminderStatus,
  scheduledAtUtc: string,
  now: number,
): ReminderUrgency {
  if (status !== "scheduled") return "neutral";
  const remaining = Date.parse(scheduledAtUtc) - now;
  if (!Number.isFinite(remaining)) return "neutral";
  if (remaining < HOUR) return "urgent";
  if (remaining < 24 * HOUR) return "soon";
  return "later";
}
