import { expect, test } from "@playwright/test";

test("registration, protected page, renewal, and logout", async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "correct horse battery staple";
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(`Sesión activa para ${email}`)).toBeVisible();

  const apiPort = process.env.E2E_API_PORT ?? "8000";
  const webOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  const direct = await request.post(
    `http://127.0.0.1:${apiPort}/api/v1/auth/login`,
    {
      data: { email, password },
    },
  );
  const tokens = await direct.json();
  const publicSession = await request.get(`${webOrigin}/api/auth/session`, {
    headers: {
      Cookie: (await page.context().cookies())
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    },
  });
  const exposed = await publicSession.text();
  expect(exposed).not.toContain("accessToken");
  expect(exposed).not.toContain("refreshToken");
  expect(exposed).not.toContain(tokens.access_token);
  expect(exposed).not.toContain(tokens.refresh_token);
  expect(await page.content()).not.toContain(tokens.access_token);
  const profile = await page.request.get("/api/account/me");
  expect(profile.status()).toBe(200);
  const profileBody = await profile.text();
  expect(profileBody).not.toContain("access_token");
  expect(profileBody).not.toContain("refresh_token");

  // E2E access tokens last 120 seconds; renewal begins 30 seconds before expiry.
  await page.waitForTimeout(95_000);
  await page.reload();
  await expect(page.getByText(`Sesión activa para ${email}`)).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login reaches dashboard after an unauthenticated redirect", async ({
  page,
}) => {
  const email = `e2e-login-${Date.now()}@example.com`;
  const password = "correct horse battery staple";
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(`Sesión activa para ${email}`)).toBeVisible();
});
