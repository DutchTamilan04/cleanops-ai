import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const accounts = {
  director: process.env.TORNADO_FINANCE_DIRECTOR_EMAIL ?? "finance-showcase.darrel-director@cleanops.example.com",
  area: process.env.TORNADO_FINANCE_AREA_EMAIL ?? "finance-showcase.shayana-area@cleanops.example.com",
  showcaseSupervisor: process.env.TORNADO_FINANCE_SUPERVISOR_EMAIL ?? "finance-showcase.hardeep@cleanops.example.com",
  legacySupervisor: process.env.TORNADO_OPERATIONS_SUPERVISOR_EMAIL ?? "hardeep.supervisor@cleanops.example.com",
  legacyDirector: process.env.TORNADO_OPERATIONS_DIRECTOR_EMAIL ?? "darrel.director@cleanops.example.com",
} as const;

/** #114: presenter pacing. Off for the UAT run; the presenter reel sets TORNADO_PRESENTER=1. */
export const presenterMode = () => process.env.TORNADO_PRESENTER === "1";

/** Hold on the top of the screen, scroll through it at reading pace, then return to the top. */
export async function present(page: Page) {
  if (!presenterMode()) return;
  await page.waitForTimeout(2200);
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (overflow > 40) {
    const distance = Math.min(overflow, 2400);
    const steps = Math.max(8, Math.round(distance / 60));
    for (let i = 1; i <= steps; i += 1) {
      await page.evaluate((y) => window.scrollTo({ top: y }), Math.round((distance * i) / steps));
      await page.waitForTimeout(45);
    }
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  }
  await page.waitForTimeout(500);
}

export async function capture(page: Page, name: string) {
  const folder = join(process.cwd(), "artifacts/tornado-demo/screenshots");
  await mkdir(folder, { recursive: true });
  const path = join(folder, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await test.info().attach(name, { path, contentType: "image/png" });
  await present(page);
}

// #114: browser console errors and uncaught page errors, per page. Recorded, not hidden.
const consoleErrors = new WeakMap<Page, string[]>();
export function watchConsole(page: Page) {
  if (consoleErrors.has(page)) return;
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text().slice(0, 300)); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.slice(0, 300)}`));
}
export const consoleErrorsFor = (page: Page) => [...(consoleErrors.get(page) ?? [])];

export async function signIn(page: Page, email: string, password = process.env.TORNADO_DEMO_PASSWORD) {
  if (!password) throw new Error("TORNADO_DEMO_PASSWORD is required. See TORNADO_DEMO.md.");
  watchConsole(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Explore the BC casino operations demo" })).toBeVisible();
  // #114: wait for hydration; a click before it posts the form before the router is ready (seen on first dev compile).
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Demo password").fill(password);
  await page.getByRole("button", { name: "Open demo workspace" }).click();
  await expect(page).toHaveURL(/\/(operations|mobile)(?:\?.*)?$/);
  await expect(page.getByRole("status", { name: /Prototype/i }).or(page.locator(".prototypeBanner"))).toBeVisible();
}

export async function visit(page: Page, path: string, heading: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} must respond successfully`).toBeTruthy();
  await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sign in required|access restricted|unavailable|No casino assignment/i })).toHaveCount(0);
}

/** Password for an account key: the legacy operations accounts use their own protected value. */
export function passwordFor(account: keyof typeof accounts) {
  return account === "legacySupervisor" || account === "legacyDirector"
    ? process.env.TORNADO_OPERATIONS_PASSWORD
    : process.env.TORNADO_DEMO_PASSWORD;
}
