import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";

import { accountEmailRequest } from "./account-email";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("rejects a cross-origin account mutation", async () => {
  vi.stubEnv("WEB_ORIGIN", "https://recordatorios-web-one.vercel.app");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const request = new Request(
    "https://recordatorios-web-one.vercel.app/api/account/forgot-password",
    {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "test@example.com" }),
    },
  );
  const response = await accountEmailRequest(
    request,
    "forgot-password",
    z.object({ email: z.email() }),
  );
  expect(response.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

test("forwards a valid mutation without exposing provider details", async () => {
  vi.stubEnv("WEB_ORIGIN", "https://recordatorios-web-one.vercel.app");
  vi.stubEnv("API_BASE_URL", "https://api.example.com");
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const request = new Request(
    "https://recordatorios-web-one.vercel.app/api/account/verify-email",
    {
      method: "POST",
      headers: {
        Origin: "https://recordatorios-web-one.vercel.app",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "A".repeat(43) }),
    },
  );
  const response = await accountEmailRequest(
    request,
    "verify-email",
    z.object({ token: z.string() }),
  );
  expect(response.status).toBe(204);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(
    "https://api.example.com/api/v1/auth/verify-email",
  );
});
