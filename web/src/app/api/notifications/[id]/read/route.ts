import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";
import { validOrigin } from "@/lib/origin";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!validOrigin(request)) return failure(403);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return failure(404);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  try {
    const { response } = await apiClient().POST(
      "/api/v1/notifications/{notification_id}/read",
      {
        headers: { Authorization: authorization },
        params: { path: { notification_id: id } },
      },
    );
    return response.status === 204
      ? new Response(null, { status: 204 })
      : failure(response.status);
  } catch {
    return unavailable();
  }
}
