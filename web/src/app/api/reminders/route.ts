import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";
import { validOrigin } from "@/lib/origin";
import { reminderCreate } from "@/lib/reminder-schemas";

const querySchema = z.object({
  status: z.enum(["upcoming", "fired", "canceled"]).default("upcoming"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return failure(422);
  try {
    const { data, response } = await apiClient().GET("/api/v1/reminders", {
      headers: { Authorization: authorization },
      params: { query: parsed.data },
    });
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return failure(403);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  const parsed = reminderCreate.safeParse(
    await request.json().catch(() => null),
  );
  const key = request.headers.get("Idempotency-Key");
  if (!parsed.success || !key || !z.uuid().safeParse(key).success)
    return failure(422);
  try {
    const { data, response } = await apiClient().POST("/api/v1/reminders", {
      headers: { Authorization: authorization },
      params: { header: { "Idempotency-Key": key } },
      body: parsed.data,
    });
    return data
      ? Response.json(data, { status: response.status })
      : failure(response.status);
  } catch {
    return unavailable();
  }
}
