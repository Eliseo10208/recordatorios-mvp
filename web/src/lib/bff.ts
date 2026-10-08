import type { NextRequest } from "next/server";

import { privateToken } from "./private-token";

export async function bearer(request: NextRequest): Promise<string | null> {
  const token = await privateToken(request);
  if (
    !token?.accessToken ||
    token.error ||
    !token.accessExpiresAt ||
    token.accessExpiresAt <= Date.now()
  ) {
    return null;
  }
  return `Bearer ${token.accessToken}`;
}

export function failure(status: number): Response {
  return Response.json(
    { title: status === 409 ? "Conflicto de versión" : "Solicitud rechazada" },
    { status },
  );
}

export function unavailable(): Response {
  return Response.json({ title: "Servicio no disponible" }, { status: 503 });
}
