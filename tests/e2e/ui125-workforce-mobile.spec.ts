import { expect, test } from "@playwright/test";
import { signInAs } from "./auth";

test("Supervisor sees workforce coverage and replacement actions at desktop and phone widths", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);
  await page.goto("/operations");
  const command = page.getByRole("heading", { name: "Operations command" });
  await expect(command).toBeVisible();
  await expect(page.locator('[aria-label="Operations summary"]')).toContainText("Eligible workers present");
  await expect(page.getByRole("heading", { name: "Eligible replacement candidates" })).toBeVisible();
  await expect(page.locator(".replacementList article").first()).toContainText(/Eligible · available|Assigned · awaiting check-in|Checked in/);
  await page.locator(".opsWorkspace").evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "test-results/ui125-workforce-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Site zones" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".opsWorkspace").evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "test-results/ui125-workforce-mobile.png" });
});

test("Cleaner keeps task capture and expense entry available without operations access", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_CLEANER_EMAIL);
  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: "Operations access restricted" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mobile");
  await expect(page.getByRole("heading", { name: "Task evidence" })).toBeVisible();
  await expect(page.getByText("Synthetic shift", { exact: true })).toBeVisible();
  const captureAction = page.getByRole("button", { name: /Select .* task|Take .* photo|Choose .* photo from library/ }).first();
  if (await captureAction.count()) await expect(captureAction).toBeVisible();
  else await expect(page.getByText("Submission ready for review")).toBeVisible();
  await page.screenshot({ path: "test-results/ui125-capture-mobile.png" });

  await page.goto("/mobile/expenses");
  await expect(page.getByRole("heading", { name: "Submit an expense", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit expense" })).toBeDisabled();
  await page.getByLabel("Expense details").fill("Synthetic fuel expense for review");
  await expect(page.getByRole("button", { name: "Submit expense" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ui125-expense-mobile.png" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByLabel("Casino")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
