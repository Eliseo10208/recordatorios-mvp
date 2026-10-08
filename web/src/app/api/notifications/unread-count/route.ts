import type { NextRequest } from "next/server";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";

export async function GET(request: NextRequest) {
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  try {
    const { data, response } = await apiClient().GET(
      "/api/v1/notifications/unread-count",
      { headers: { Authorization: authorization } },
    );
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}
