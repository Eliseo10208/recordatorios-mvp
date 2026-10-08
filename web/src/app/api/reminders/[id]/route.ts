import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";
import { validOrigin } from "@/lib/origin";
import { reminderPatch, versionInput } from "@/lib/reminder-schemas";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return failure(404);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  try {
    const { data, response } = await apiClient().GET(
      "/api/v1/reminders/{reminder_id}",
      {
        headers: { Authorization: authorization },
        params: { path: { reminder_id: id } },
      },
    );
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!validOrigin(request)) return failure(403);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return failure(404);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  const parsed = reminderPatch.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return failure(422);
  try {
    const { data, response } = await apiClient().PATCH(
      "/api/v1/reminders/{reminder_id}",
      {
        headers: { Authorization: authorization },
        params: { path: { reminder_id: id } },
        body: parsed.data,
      },
    );
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!validOrigin(request)) return failure(403);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return failure(404);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  const parsed = versionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(422);
  try {
    const { response } = await apiClient().DELETE(
      "/api/v1/reminders/{reminder_id}",
      {
        headers: { Authorization: authorization },
        params: { path: { reminder_id: id } },
        body: parsed.data,
      },
    );
    return response.status === 204
      ? new Response(null, { status: 204 })
      : failure(response.status);
  } catch {
    return unavailable();
  }
}
