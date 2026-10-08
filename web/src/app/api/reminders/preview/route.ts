import type { NextRequest } from "next/server";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";
import { validOrigin } from "@/lib/origin";
import { schedule } from "@/lib/reminder-schemas";

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return failure(403);
  const authorization = await bearer(request);
  if (!authorization) return failure(401);
  const parsed = schedule.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(422);
  try {
    const { data, response } = await apiClient().POST(
      "/api/v1/reminders/preview",
      { headers: { Authorization: authorization }, body: parsed.data },
    );
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}
