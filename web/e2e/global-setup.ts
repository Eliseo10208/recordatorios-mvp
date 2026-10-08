import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

export default async function globalSetup() {
  const file = path.join(__dirname, "../.auth-state/ui-polish.json");
  await mkdir(path.dirname(file), { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    });
    try {
      const page = await context.newPage();
      const email = `ui-${Date.now()}@example.com`;
      await page.goto("/register");
      await page.getByLabel("Correo electrónico").fill(email);
      await page.getByLabel("Contraseña").fill("correct horse battery staple");
      await page.getByRole("button", { name: "Crear cuenta" }).click();
      await page.waitForURL(/\/dashboard/);
      await context.storageState({ path: file });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
