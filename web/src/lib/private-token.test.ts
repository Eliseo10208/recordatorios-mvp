import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { privateToken } from "./private-token";

const previousSecret = process.env.AUTH_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});

describe("private session cookie", () => {
  it.each([
    ["http:", "authjs.session-token"],
    ["https:", "__Secure-authjs.session-token"],
  ])("reads the Auth.js cookie on %s", async (protocol, cookieName) => {
    process.env.AUTH_SECRET = "test-secret-long-enough-for-session-encryption";
    const session = await encode({
      token: { sub: "test-user", accessToken: "test-access" },
      secret: process.env.AUTH_SECRET,
      salt: cookieName,
    });
    const request = new NextRequest(`${protocol}//example.com/api/account/me`, {
      headers: { cookie: `${cookieName}=${session}` },
    });

    const token = await privateToken(request);
    expect(token?.sub).toBe("test-user");
    expect(token?.accessToken).toBe("test-access");
  });
});
