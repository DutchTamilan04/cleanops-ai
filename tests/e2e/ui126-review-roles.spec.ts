import { expect, test } from "@playwright/test";
import { signInAs } from "./auth";

test("Supervisor sees private review states at desktop and phone widths", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Evidence review" })).toBeVisible();
  await expect(page.locator('[aria-label="Task summary"]')).toContainText("Current revision");
  const action = page.getByRole("button", { name: /Prepare submission|Run Mock AI|Refresh image/ }).first();
  await expect(action).toBeVisible();
  await action.focus();
  await expect(action).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(":focus-visible")).not.toHaveCount(0);
  await page.screenshot({ path: "test-results/ui126-supervisor-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ui126-supervisor-mobile.png" });
});

test("Client cannot open review evidence at desktop or phone width", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_CLIENT_EMAIL);
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Review access restricted" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before and after" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Review access restricted" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ui126-client-restricted-mobile.png" });
});
