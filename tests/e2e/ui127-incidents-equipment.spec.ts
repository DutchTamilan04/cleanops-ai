import { expect, test } from "@playwright/test";
import { signInAs } from "./auth";

const widths = [1440, 390];

test("Supervisor sees the incident and equipment fixture as reports on desktop and mobile", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/incidents");
    await expect(page.getByRole("heading", { name: "Incident & equipment desk" })).toBeVisible();
    await expect(page.getByText("Cause undetermined", { exact: true })).toBeVisible();
    await expect(page.getByText("Report only", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record reported incident" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record scrubber report" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/ui127-supervisor-${width}.png`, fullPage: true });
  }
});

test("Area Manager sees assigned equipment and an explicit no-fixture incident state", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_AREA_EMAIL);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/operations");
    await expect(page.getByRole("heading", { name: "Assigned casinos" })).toBeVisible();
    await expect(page.getByText("Equipment register")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/ui127-area-equipment-${width}.png`, fullPage: true });

    await page.goto("/incidents");
    await expect(page.getByRole("heading", { name: "No incident fixture for assigned casinos" })).toBeVisible();
    await expect(page.locator(".accessState .ui-alert-info")).toContainText("outside your assigned sites");
    await expect(page.getByRole("button", { name: "Record reported incident" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/ui127-area-no-fixture-${width}.png`, fullPage: true });
  }
});
