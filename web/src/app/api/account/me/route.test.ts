import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const previousSecret = process.env.AUTH_SECRET;
const previousApiBaseUrl = process.env.API_BASE_URL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
  if (previousApiBaseUrl === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = previousApiBaseUrl;
});

describe("GET /api/account/me", () => {
  it("accepts the secure Auth.js cookie used on HTTPS", async () => {
    const secret = "test-secret-long-enough-for-session-encryption";
    process.env.AUTH_SECRET = secret;
    process.env.API_BASE_URL = "https://api.example.test";
    const session = await encode({
      token: { sub: "test-user", accessToken: "test-access" },
      secret,
      salt: "__Secure-authjs.session-token",
    });
    const fetchApi = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers =
          input instanceof Request ? input.headers : new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer test-access");
        return Response.json({ id: "test-user" });
      },
    );
    vi.stubGlobal("fetch", fetchApi);
    const request = new NextRequest(
      "https://recordatorios.example.test/api/account/me",
      { headers: { cookie: `__Secure-authjs.session-token=${session}` } },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "test-user" });
    expect(fetchApi).toHaveBeenCalledOnce();
  });
});
