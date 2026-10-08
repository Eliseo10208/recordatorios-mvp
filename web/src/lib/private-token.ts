import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export function privateToken(request: NextRequest) {
  return getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });
}
