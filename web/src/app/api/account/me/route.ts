import type { NextRequest } from "next/server";

import { apiClient } from "@/lib/api";
import { privateToken } from "@/lib/private-token";

export async function GET(request: NextRequest) {
  const token = await privateToken(request);
  if (!token?.accessToken || token.error) {
    return Response.json({ title: "Unauthenticated" }, { status: 401 });
  }
  try {
    const { data, response } = await apiClient().GET("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (!data)
      return Response.json(
        { title: "Unauthenticated" },
        { status: response.status },
      );
    return Response.json(data);
  } catch {
    return Response.json({ title: "Service unavailable" }, { status: 503 });
  }
}
