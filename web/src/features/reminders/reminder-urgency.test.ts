import { expect, test } from "vitest";

import { getReminderUrgency } from "./reminder-urgency";

const now = Date.parse("2026-10-08T12:00:00.000Z");

test("uses the one-hour and 24-hour boundaries for scheduled reminders", () => {
  expect(
    getReminderUrgency(
      "scheduled",
      new Date(now + 3_599_999).toISOString(),
      now,
    ),
  ).toBe("urgent");
  expect(
    getReminderUrgency(
      "scheduled",
      new Date(now + 3_600_000).toISOString(),
      now,
    ),
  ).toBe("soon");
  expect(
    getReminderUrgency(
      "scheduled",
      new Date(now + 86_399_999).toISOString(),
      now,
    ),
  ).toBe("soon");
  expect(
    getReminderUrgency(
      "scheduled",
      new Date(now + 86_400_000).toISOString(),
      now,
    ),
  ).toBe("later");
});

test("keeps non-editable states visually neutral", () => {
  for (const status of ["processing", "fired", "canceled"] as const) {
    expect(
      getReminderUrgency(status, new Date(now + 1000).toISOString(), now),
    ).toBe("neutral");
  }
});
