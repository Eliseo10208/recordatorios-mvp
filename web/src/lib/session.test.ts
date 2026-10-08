import { describe, expect, it } from "vitest";

import { publicSession, shouldRefresh } from "./session";

describe("server session boundary", () => {
  it("never serializes API tokens into the public Auth.js session", () => {
    const result = publicSession(
      {
        user: {
          id: "user-1",
          name: null,
          email: "demo@example.com",
          image: null,
        },
        expires: "later",
      },
      {
        sub: "user-1",
        email: "demo@example.com",
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
        accessExpiresAt: Date.now() + 60_000,
      },
    );
    expect(result.user?.id).toBe("user-1");
    expect(JSON.stringify(result)).not.toContain("secret-access");
    expect(JSON.stringify(result)).not.toContain("secret-refresh");
  });

  it("renews before the access token expires", () => {
    expect(shouldRefresh(Date.now() + 29_000, Date.now())).toBe(true);
    expect(shouldRefresh(Date.now() + 90_000, Date.now())).toBe(false);
  });
});
