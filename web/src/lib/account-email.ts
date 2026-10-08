import { z } from "zod";

import { validOrigin } from "./origin";

type EmailAction =
  "verify-email" | "resend-verification" | "forgot-password" | "reset-password";

export async function accountEmailRequest(
  request: Request,
  action: EmailAction,
  schema: z.ZodType,
  authorization?: string,
) {
  if (!validOrigin(request))
    return Response.json({ title: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ title: "Invalid request" }, { status: 422 });
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl)
    return Response.json({ title: "Service unavailable" }, { status: 503 });
  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 204) return new Response(null, { status: 204 });
    return Response.json(
      { title: response.ok ? "Accepted" : "Request failed" },
      { status: response.status },
    );
  } catch {
    return Response.json({ title: "Service unavailable" }, { status: 503 });
  }
}
