import type { NextRequest } from "next/server";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";
import { validOrigin } from "@/lib/origin";
import { whatsappDestination } from "@/lib/reminder-schemas";

const endpoint = "/api/v1/notification-settings/whatsapp" as const;

export async function GET(request: NextRequest) {
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  try {
    const { data, response } = await apiClient().GET(endpoint, {
      headers: { Authorization: authorization },
    });
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}

export async function PUT(request: NextRequest) {
  if (!validOrigin(request)) return failure(403);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  const parsed = whatsappDestination.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return failure(422);
  try {
    const { data, response } = await apiClient().PUT(endpoint, {
      headers: { Authorization: authorization },
      body: parsed.data,
    });
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}

export async function DELETE(request: NextRequest) {
  if (!validOrigin(request)) return failure(403);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  try {
    const { response } = await apiClient().DELETE(endpoint, {
      headers: { Authorization: authorization },
    });
    return response.ok
      ? new Response(null, { status: 204 })
      : failure(response.status);
  } catch {
    return unavailable();
  }
}
