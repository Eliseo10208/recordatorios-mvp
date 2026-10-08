import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";
import { validOrigin } from "@/lib/origin";
import { versionInput } from "@/lib/reminder-schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!validOrigin(request)) return failure(403);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return failure(404);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  const parsed = versionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(422);
  try {
    const { data, response } = await apiClient().POST(
      "/api/v1/reminders/{reminder_id}/cancel",
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
