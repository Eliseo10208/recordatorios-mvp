import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

import { apiClient } from "@/lib/api";
import { validOrigin } from "@/lib/origin";

export async function POST(request: NextRequest) {
  if (!validOrigin(request))
    return Response.json({ title: "Forbidden" }, { status: 403 });
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });
  if (!token?.refreshToken) return new Response(null, { status: 204 });
  try {
    const { response } = await apiClient().POST("/api/v1/auth/logout", {
      body: { refresh_token: token.refreshToken },
    });
    if (response.status !== 204) {
      return Response.json({ title: "Logout unavailable" }, { status: 503 });
    }
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ title: "Logout unavailable" }, { status: 503 });
  }
}
