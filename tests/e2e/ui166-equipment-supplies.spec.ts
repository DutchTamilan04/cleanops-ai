import { expect, test, type Page } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

const widths = [1440, 390];
const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("Director sees the V2 asset register, filters it and opens an asset", async ({ page }) => {
  await signInAsDirector(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/equipment");
    await expect(page.getByRole("heading", { name: "Asset register" })).toBeVisible();
    await expect(page.getByText("Ready for use", { exact: true })).toBeVisible();
    const table = page.locator(".ui-dataTable table");
    await expect(table).toBeVisible();
    await page.getByLabel("Search assets").fill("zzz-no-such-asset");
    await expect(page.getByText("No assets match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByRole("link", { name: /EQ-/ }).first()).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `test-results/ui166-asset-register-${width}.png`, fullPage: true });

    await page.getByRole("link", { name: /EQ-/ }).first().click();
    // The first visit compiles the detail route in dev mode; wait for the navigation itself.
    await page.waitForURL(/\/equipment\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Asset register");
    await expect(page.getByRole("navigation", { name: "Asset sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Faults and maintenance" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `test-results/ui166-asset-detail-${width}.png`, fullPage: true });
  }
});

test("Area Manager sees the V2 supplies workspace", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_AREA_EMAIL);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/supplies");
    await expect(page.getByRole("heading", { name: "Supply requests and stock" })).toBeVisible();
    await expect(page.getByText("Awaiting approval", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request supplies" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Site stock" })).toBeVisible();
    await expect(page.getByLabel("Purpose")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `test-results/ui166-supplies-${width}.png`, fullPage: true });
  }
});
