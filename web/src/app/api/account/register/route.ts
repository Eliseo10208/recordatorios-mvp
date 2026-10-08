import { z } from "zod";

import { apiClient } from "@/lib/api";
import { validOrigin } from "@/lib/origin";

const registration = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  if (!validOrigin(request))
    return Response.json({ title: "Forbidden" }, { status: 403 });
  const parsed = registration.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ title: "Invalid request" }, { status: 422 });
  try {
    const { data, response } = await apiClient().POST("/api/v1/auth/register", {
      body: parsed.data,
    });
    if (!data) {
      return Response.json(
        {
          title:
            response.status === 409
              ? "Email already registered"
              : "Registration failed",
        },
        { status: response.status },
      );
    }
    return Response.json(data, { status: 201 });
  } catch {
    return Response.json(
      { title: "Registration unavailable" },
      { status: 503 },
    );
  }
}
