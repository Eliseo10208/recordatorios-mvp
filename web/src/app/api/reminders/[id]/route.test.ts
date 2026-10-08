import type { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { DELETE } from "./route";

const mock = vi.hoisted(() => ({
  bearer: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/bff", () => ({
  bearer: mock.bearer,
  failure: (status: number) => new Response(null, { status }),
  unavailable: () => new Response(null, { status: 503 }),
}));
vi.mock("@/lib/api", () => ({
  apiClient: () => ({ DELETE: mock.delete }),
}));

const id = "dba02115-505a-4e8a-908c-26ee377200eb";
const context = { params: Promise.resolve({ id }) };

function request(
  origin = "https://app.example.test",
  body: unknown = { expected_version: 2 },
) {
  return new Request(`https://app.example.test/api/reminders/${id}`, {
    method: "DELETE",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

beforeEach(() => {
  vi.stubEnv("WEB_ORIGIN", "https://app.example.test");
  mock.bearer.mockResolvedValue("Bearer server-only-jwt");
  mock.delete.mockResolvedValue({ response: { status: 204 } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

test("validates origin, login and version before contacting FastAPI", async () => {
  expect((await DELETE(request("https://other.test"), context)).status).toBe(
    403,
  );
  mock.bearer.mockResolvedValueOnce(null);
  expect((await DELETE(request(), context)).status).toBe(401);
  expect((await DELETE(request(undefined, {}), context)).status).toBe(422);
  expect(mock.delete).not.toHaveBeenCalled();
});

test("forwards the version and keeps the JWT out of the browser response", async () => {
  const response = await DELETE(request(), context);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(mock.delete).toHaveBeenCalledWith("/api/v1/reminders/{reminder_id}", {
    headers: { Authorization: "Bearer server-only-jwt" },
    params: { path: { reminder_id: id } },
    body: { expected_version: 2 },
  });
  mock.delete.mockResolvedValueOnce({ response: { status: 409 } });
  expect((await DELETE(request(), context)).status).toBe(409);
});
