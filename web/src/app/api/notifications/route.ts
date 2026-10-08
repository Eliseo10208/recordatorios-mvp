import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiClient } from "@/lib/api";
import { bearer, failure, unavailable } from "@/lib/bff";

const querySchema = z.object({
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
    const { data, response } = await apiClient().GET("/api/v1/notifications", {
      headers: { Authorization: authorization },
      params: { query: parsed.data },
    });
    return data ? Response.json(data) : failure(response.status);
  } catch {
    return unavailable();
  }
}
