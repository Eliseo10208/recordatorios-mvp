import createClient from "openapi-fetch";

import type { paths } from "./api-types";

export function apiClient() {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) throw new Error("API_BASE_URL is required");
  return createClient<paths>({ baseUrl, cache: "no-store" });
}
