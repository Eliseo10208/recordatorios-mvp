"use client";

export async function authenticatedFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sessionResponse = await fetch("/api/auth/session", {
      cache: "no-store",
    });
    if (!sessionResponse.ok) throw new Error("Unauthenticated");
    const session: unknown = await sessionResponse.json();
    if (
      typeof session !== "object" ||
      session === null ||
      !("user" in session) ||
      !session.user ||
      ("error" in session && session.error)
    ) {
      throw new Error("Unauthenticated");
    }
    const response = await fetch(path, { ...init, cache: "no-store" });
    if (response.status !== 401 || attempt === 1) return response;
  }
  throw new Error("Unauthenticated");
}
