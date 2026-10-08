import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("opt in, schedule a WhatsApp copy, and opt out", async ({ page }) => {
  const email = `whatsapp-e2e-${Date.now()}@example.com`;
  const phone = "+525512345678";
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await page.getByLabel("Número con código de país").fill(phone);
  await page.getByLabel(/Acepto recibir por WhatsApp/).check();
  await page.getByRole("button", { name: "Guardar número" }).click();
  await expect(page.getByText(/Número activo:.*5678/)).toBeVisible();
  const settings = await page.request.get(
    "/api/notification-settings/whatsapp",
  );
  expect(settings.status()).toBe(200);
  expect(await settings.text()).not.toContain(phone);
  const rejected = await page.request.put(
    "/api/notification-settings/whatsapp",
    {
      headers: { Origin: "https://other.example" },
      data: { phone, consent: true },
    },
  );
  expect(rejected.status()).toBe(403);

  await page.getByRole("button", { name: "Volver" }).click();
  await page.getByRole("button", { name: "Añadir recordatorio" }).click();
  await page.getByLabel("¿Qué necesitas recordar?").fill("Cita importante");
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await page.getByLabel("Fecha").fill(tomorrow.toISOString().slice(0, 10));
  await page.getByLabel("Hora", { exact: true }).fill("12:00");
  await page.getByLabel("Zona horaria IANA").fill("UTC");
  await page.getByLabel("Enviar también una copia por WhatsApp").check();
  await expect(page.getByText(/Te avisaremos el/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar recordatorio" }).click();
  await expect(
    page.getByRole("heading", { name: "Cita importante" }),
  ).toBeVisible();
  await expect(page.getByText(/WhatsApp: programado/)).toBeVisible();

  await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await page.getByRole("button", { name: "Desactivar WhatsApp" }).click();
  await expect(page.getByText(/Número activo:/)).toHaveCount(0);
  const reminders = await page.request.get("/api/reminders");
  expect(reminders.status()).toBe(200);
  expect((await reminders.json()).items[0].send_whatsapp).toBe(false);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
