import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { apiClient } from "./lib/api";
import { publicSession, shouldRefresh } from "./lib/session";

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: { type: "password" } },
      async authorize(input) {
        const parsed = credentialsSchema.safeParse(input);
        if (!parsed.success) return null;
        const { data, response } = await apiClient().POST(
          "/api/v1/auth/login",
          {
            body: parsed.data,
          },
        );
        if (response.status === 401 || response.status === 429) return null;
        if (!data) throw new Error("Authentication service unavailable");
        return {
          id: data.user.id,
          email: data.user.email,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          accessExpiresAt: Date.now() + data.expires_in * 1000,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          sub: user.id,
          email: user.email,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessExpiresAt: user.accessExpiresAt,
        };
      }
      if (!token.refreshToken || !token.accessExpiresAt)
        return { ...token, error: "RefreshTokenError" };
      if (!shouldRefresh(token.accessExpiresAt, Date.now())) return token;
      try {
        const { data } = await apiClient().POST("/api/v1/auth/refresh", {
          body: { refresh_token: token.refreshToken },
        });
        if (!data) return { ...token, error: "RefreshTokenError" };
        return {
          ...token,
          email: data.user.email,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          accessExpiresAt: Date.now() + data.expires_in * 1000,
          error: undefined,
        };
      } catch {
        return { ...token, error: "RefreshTokenError" };
      }
    },
    session({ session, token }) {
      return publicSession(session, token);
    },
  },
});
