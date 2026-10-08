import { expect, test } from "@playwright/test";

const token = "A".repeat(43);

test("forgot password gives the same confirmation", async ({ page }) => {
  await page.route("**/api/account/forgot-password", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "test@example.com",
    });
    await route.fulfill({ status: 202, body: "{}" });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Correo electrónico").fill("test@example.com");
  await page.getByRole("button", { name: "Solicitar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Si existe una cuenta");
});

test("reset removes token from address bar before BFF request", async ({
  page,
}) => {
  await page.route("**/api/account/reset-password", async (route) => {
    expect(page.url()).not.toContain(token);
    expect(route.request().postDataJSON()).toEqual({
      token,
      new_password: "another correct horse battery",
    });
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto(`/reset-password#token=${token}`);
  await expect(
    page.getByRole("link", { name: "Ir a iniciar sesión" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Nueva contraseña")
    .fill("another correct horse battery");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Contraseña actualizada",
  );
  await expect(
    page.getByRole("link", { name: "Ir a iniciar sesión" }),
  ).toBeVisible();
});

test("verification removes token and consumes once", async ({ page }) => {
  await page.route("**/api/account/verify-email", async (route) => {
    expect(page.url()).not.toContain(token);
    expect(route.request().postDataJSON()).toEqual({ token });
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto(`/verify-email#token=${token}`);
  await expect(page.getByRole("status")).toContainText("Correo confirmado");
});
