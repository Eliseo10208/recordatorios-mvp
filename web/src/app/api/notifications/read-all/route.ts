import type { NextRequest } from "next/server";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";
import { validOrigin } from "@/lib/origin";

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return failure(403);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  try {
    const { response } = await apiClient().POST(
      "/api/v1/notifications/read-all",
      { headers: { Authorization: authorization } },
    );
    return response.status === 204
      ? new Response(null, { status: 204 })
      : failure(response.status);
  } catch {
    return unavailable();
  }
}
