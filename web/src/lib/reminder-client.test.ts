import { afterEach, expect, test, vi } from "vitest";

import { authenticatedFetch } from "./reminder-client";

afterEach(() => vi.unstubAllGlobals());

test("renews the browser session before calling an authenticated BFF route", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ user: { id: "user" } }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  vi.stubGlobal("fetch", fetch);
  const response = await authenticatedFetch("/api/reminders");
  expect(response.status).toBe(200);
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    "/api/auth/session",
    "/api/reminders",
  ]);
});

test("does not contact the BFF when the session is invalid", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", fetch);
  await expect(authenticatedFetch("/api/reminders")).rejects.toThrow(
    "Unauthenticated",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
