import path from "node:path";

import { expect, test } from "@playwright/test";

test.use({
  storageState: path.join(__dirname, "../.auth-state/ui-polish.json"),
});

test("filter changes keep loading content and responses in the correct section", async ({
  page,
}) => {
  let releaseUpcoming!: () => void;
  let releaseFired!: () => void;
  const upcomingGate = new Promise<void>((resolve) => {
    releaseUpcoming = resolve;
  });
  const firedGate = new Promise<void>((resolve) => {
    releaseFired = resolve;
  });
  await page.route(/\/api\/reminders\?/, async (route) => {
    const status = new URL(route.request().url()).searchParams.get("status");
    if (status === "upcoming") await upcomingGate;
    if (status === "fired") await firedGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items:
          status === "fired"
            ? [
                {
                  id: "fired-test",
                  message: "Aviso disparado de prueba",
                  local_date: "2026-10-07",
                  local_time: "13:00",
                  timezone: "America/Mexico_City",
                  status: "fired",
                  send_whatsapp: false,
                  whatsapp_status: null,
                },
              ]
            : [
                {
                  id: "upcoming-test",
                  message: "Aviso anterior que no debe aparecer",
                  local_date: "2026-10-08",
                  local_time: "13:00",
                  timezone: "America/Mexico_City",
                  status: "scheduled",
                  send_whatsapp: false,
                  whatsapp_status: null,
                },
              ],
        next_cursor: null,
      }),
    });
  });
  try {
    await page.goto("/dashboard");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(
      page.getByRole("status", { name: "Cargando recordatorios" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Disparados" }).click();
    await expect(
      page.getByRole("button", { name: "Disparados" }),
    ).toHaveAttribute("aria-pressed", "true");
    releaseFired();
    await expect(page.getByText("Aviso disparado de prueba")).toBeVisible();
    releaseUpcoming();
    await expect(
      page.getByText("Aviso anterior que no debe aparecer"),
    ).toHaveCount(0);
  } finally {
    releaseUpcoming();
    releaseFired();
  }
});

test("@mobile main sections fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  for (const name of ["Mis recordatorios", "Avisos", "WhatsApp"]) {
    const button = page.getByRole("button", {
      name: name === "Avisos" ? /^Avisos \(/ : name,
      exact: name !== "Avisos",
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("reminders recover from a failed load without showing an empty state", async ({
  page,
}) => {
  let requests = 0;
  await page.route(/\/api\/reminders\?/, async (route) => {
    requests++;
    await route.fulfill({
      status: requests === 1 ? 503 : 200,
      contentType: "application/json",
      body:
        requests === 1
          ? "{}"
          : JSON.stringify({ items: [], next_cursor: null }),
    });
  });
  await page.goto("/dashboard");
  await expect(page.locator(".inline-feedback[role='alert']")).toContainText(
    "No se pudieron cargar tus recordatorios",
  );
  await expect(page.getByText("Todavía no tienes recordatorios")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByText("Todavía no tienes recordatorios")).toBeVisible();
  expect(requests).toBe(2);
});

test("inbox recovers from a failed load", async ({ page }) => {
  let requests = 0;
  await page.route(/\/api\/notifications(?:\?|$)/, async (route) => {
    requests++;
    await route.fulfill({
      status: requests === 1 ? 503 : 200,
      contentType: "application/json",
      body:
        requests === 1
          ? "{}"
          : JSON.stringify({ items: [], next_cursor: null }),
    });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Avisos \(/ }).click();
  await expect(
    page.getByRole("status", { name: "Cargando avisos" }),
  ).toBeVisible();
  await expect(page.locator(".inline-feedback[role='alert']")).toContainText(
    "No se pudieron cargar tus avisos",
  );
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByText("Todo al día")).toBeVisible();
  expect(requests).toBe(2);
});

test("WhatsApp waits for its settings before showing an unavailable state", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/notification-settings/whatsapp", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available: true,
        active: false,
        masked_number: null,
        consent_text: "Acepto recibir avisos",
      }),
    });
  });
  try {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Cargando WhatsApp" }),
    ).toBeVisible();
    await expect(
      page.getByText("Este canal aún no está configurado en el servidor."),
    ).toHaveCount(0);
    release();
    await expect(
      page.getByRole("heading", { name: "Avisos por WhatsApp" }),
    ).toBeVisible();
    await expect(page.getByLabel("Número con código de país")).toBeVisible();
  } finally {
    release();
  }
});

test("periodic reminder refresh keeps the previous content visible", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.clock.install();
  await page.route(/\/api\/reminders\?/, async (route) => {
    requests++;
    if (requests === 2) await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "refresh-test",
            message:
              requests === 1
                ? "Recordatorio visible"
                : "Recordatorio actualizado",
            local_date: "2026-10-08",
            local_time: "13:00",
            timezone: "America/Mexico_City",
            status: "scheduled",
            send_whatsapp: false,
            whatsapp_status: null,
          },
        ],
        next_cursor: null,
      }),
    });
  });
  try {
    await page.goto("/dashboard");
    await expect(page.getByText("Recordatorio visible")).toBeVisible();
    await page.clock.fastForward(15_000);
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByText("Recordatorio visible")).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Cargando recordatorios" }),
    ).toHaveCount(0);
    release();
    await expect(page.getByText("Recordatorio actualizado")).toBeVisible();
  } finally {
    release();
  }
});

test("forgot password prevents a repeated request while sending", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/account/forgot-password", async (route) => {
    requests++;
    await gate;
    await route.fulfill({ status: 202, body: "{}" });
  });
  try {
    await page.goto("/forgot-password");
    await page.getByLabel("Correo electrónico").fill("test@example.com");
    await page.getByRole("button", { name: "Solicitar enlace" }).click();
    const button = page.getByRole("button", { name: "Solicitando enlace…" });
    await expect(button).toBeDisabled();
    await button.click({ force: true });
    expect(requests).toBe(1);
    release();
    await expect(page.getByRole("status")).toContainText(
      "Si existe una cuenta",
    );
  } finally {
    release();
  }
});
