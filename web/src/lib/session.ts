import type { Session } from "next-auth";

type PrivateToken = {
  sub?: string;
  email?: string | null;
  accessToken?: string;
  refreshToken?: string;
  accessExpiresAt?: number;
  error?: "RefreshTokenError";
};

export function shouldRefresh(expiresAt: number, now: number): boolean {
  return now >= expiresAt - 30_000;
}

export function publicSession(session: Session, token: PrivateToken): Session {
  return {
    expires: session.expires,
    user: {
      id: token.sub ?? "",
      email: token.email ?? null,
      name: null,
      image: null,
    },
    ...(token.error ? { error: token.error } : {}),
  };
}
