import { expect, test } from "vitest";

import { timeZoneGroups, timeZoneLabel } from "./time-zones";

test("shows friendly city names while retaining IANA values", () => {
  expect(timeZoneLabel("America/Mexico_City")).toBe("Ciudad de México");
  expect(timeZoneLabel("Europe/London")).toBe("London · Europa");
  expect(timeZoneLabel("UTC")).toBe("Hora universal");
});

test("includes detected and saved zones even when the browser list is limited", () => {
  const groups = timeZoneGroups("Pacific/Auckland", ["Europe/London"]);
  expect(groups[0].zones).toContain("America/Mexico_City");
  expect(groups.flatMap((group) => group.zones)).toContain("Pacific/Auckland");
  expect(groups.flatMap((group) => group.zones)).toContain("Europe/London");
  expect(groups.flatMap((group) => group.zones)).toContain("UTC");
});
