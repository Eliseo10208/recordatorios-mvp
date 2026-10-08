import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("create, edit, cancel, fire, and read an internal notice", async ({
  page,
}) => {
  const email = `reminder-e2e-${Date.now()}@example.com`;
  const password = "correct horse battery staple";
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Lo importante, a su tiempo." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Añadir recordatorio" }).click();
  await page.getByLabel("¿Qué necesitas recordar?").fill("Cambiar este aviso");
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await page.getByLabel("Fecha").fill(tomorrow.toISOString().slice(0, 10));
  await page.getByLabel("Hora", { exact: true }).fill("12:00");
  await page.getByLabel("Zona horaria").selectOption("UTC");
  await expect(page.getByText(/Te avisaremos el/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar recordatorio" }).click();
  await expect(
    page.getByRole("heading", { name: "Cambiar este aviso" }),
  ).toBeVisible();
  const bffList = await page.request.get("/api/reminders");
  expect(bffList.status()).toBe(200);
  expect(await bffList.text()).not.toMatch(/access_token|refresh_token/);
  const rejectedOrigin = await page.request.post("/api/reminders/preview", {
    headers: { Origin: "https://another.example" },
    data: {
      local_date: tomorrow.toISOString().slice(0, 10),
      local_time: "12:00",
      timezone: "UTC",
    },
  });
  expect(rejectedOrigin.status()).toBe(403);
  await page.getByRole("button", { name: "Mis recordatorios" }).click();
  await page.getByRole("button", { name: "Editar Cambiar este aviso" }).click();
  await expect(
    page.getByRole("heading", { name: "Editar recordatorio" }),
  ).toBeVisible();
  await page.getByLabel("¿Qué necesitas recordar?").fill("Aviso editado");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("heading", { name: "Aviso editado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar recordatorio" }).click();
  await expect(page.getByText("Estado: canceled")).toBeVisible();

  await page.getByRole("button", { name: "Mis recordatorios" }).click();
  await page.getByRole("button", { name: "Cancelados" }).click();
  await page
    .getByRole("button", { name: "Ver detalle de Aviso editado" })
    .click();
  await expect(page.getByText("Estado: canceled")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar recordatorio" }).click();
  await expect(
    page.getByText("El recordatorio y sus avisos desaparecerán de tu cuenta."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sí, eliminar" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page.getByText("No hay recordatorios cancelados")).toBeVisible();
  await page.getByRole("button", { name: "Mis recordatorios" }).click();
  await page.getByRole("button", { name: "Añadir recordatorio" }).click();
  await page
    .getByLabel("¿Qué necesitas recordar?")
    .fill("Tomar el medicamento");
  const soon = new Date(Date.now() + 65_000);
  await page.getByLabel("Fecha").fill(soon.toISOString().slice(0, 10));
  await page
    .getByLabel("Hora", { exact: true })
    .fill(soon.toISOString().slice(11, 16));
  await page.getByLabel("Zona horaria").selectOption("UTC");
  await expect(page.getByText(/Te avisaremos el/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar recordatorio" }).click();
  await expect(
    page.getByRole("heading", { name: "Tomar el medicamento" }),
  ).toBeVisible();

  await expect
    .poll(
      async () => {
        await page.getByRole("button", { name: /Avisos \(/ }).click();
        return page.getByText("Tomar el medicamento").count();
      },
      { timeout: 100_000, intervals: [5_000] },
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Marcar leído", exact: true }).click();
  await expect(page.getByText(/^Leído ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Avisos (0)" })).toBeVisible();
  await page.getByRole("button", { name: "Ver recordatorio" }).click();
  await expect(page.getByText("Estado: fired")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar recordatorio" }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page.getByText("No hay recordatorios cancelados")).toBeVisible();
  await page.getByRole("button", { name: "Avisos (0)" }).click();
  await expect(page.getByText("Todo al día")).toBeVisible();

  await page.getByRole("button", { name: "Mis recordatorios" }).click();
  await page.getByRole("button", { name: "Próximos" }).click();
  await page.getByRole("button", { name: "Añadir recordatorio" }).click();
  await page
    .getByLabel("¿Qué necesitas recordar?")
    .fill("Ocultar recordatorio");
  await page.getByLabel("Fecha").fill(tomorrow.toISOString().slice(0, 10));
  await page.getByLabel("Hora", { exact: true }).fill("12:00");
  await page.getByLabel("Zona horaria").selectOption("UTC");
  await expect(page.getByText(/Te avisaremos el/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar recordatorio" }).click();
  await page.getByRole("button", { name: "Eliminar recordatorio" }).click();
  await page.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(page.getByText("Todavía no tienes recordatorios")).toBeVisible();

  const session = await page.request.get("/api/auth/session");
  expect(await session.text()).not.toMatch(/accessToken|refreshToken/);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
