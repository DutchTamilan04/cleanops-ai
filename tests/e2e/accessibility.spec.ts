import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

// #159: automated WCAG 2.2 A/AA scan of the main routes, per role and width.
// Any rule excluded here must name the tracking issue and the reason.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const EXCLUDED_RULES: string[] = [];

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).disableRules(EXCLUDED_RULES).analyze();
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
    count: violation.nodes.length,
  }));
  expect.soft(summary, `${label}: accessibility violations\n${JSON.stringify(summary, null, 2)}`).toEqual([]);
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const directorDesktop = [
  "/operations",
  "/equipment",
  "/review",
  "/supplies",
  "/incidents",
  "/reports",
  "/finance",
  "/finance/contracts",
  "/finance/projects",
  "/finance/inbox",
  "/finance/expenses",
  "/finance/time",
  "/finance/reconciliation",
  "/finance/rates",
];

test("sign-in page has no WCAG A/AA violations", async ({ page }) => {
  await visit(page, "/login");
  await scan(page, "/login");
});

test("Director routes have no WCAG A/AA violations at desktop width", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsDirector(page);
  for (const path of directorDesktop) {
    await visit(page, path);
    await scan(page, `Director ${path}`);
  }
});

test("Director key routes have no WCAG A/AA violations at 390px", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsDirector(page);
  for (const path of ["/operations", "/finance", "/finance/expenses", "/mobile", "/reports"]) {
    await visit(page, path);
    await scan(page, `Director 390px ${path}`);
  }
});

test("Area Manager restricted routes have no WCAG A/AA violations", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAs(page, process.env.CLEANOPS_E2E_AREA_EMAIL);
  for (const path of ["/operations", "/finance", "/finance/expenses", "/finance/reconciliation", "/reports"]) {
    await visit(page, path);
    await scan(page, `Area Manager ${path}`);
  }
});

test("an open confirmation dialog has no WCAG A/AA violations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsDirector(page);
  await visit(page, "/finance");
  // Preview only: the import is never accepted, so this test changes no data.
  const header = "source_document_id,source_line_id,site_reference,service_period,accounting_period,currency,category,amount,approval_state,recognition_state";
  const csv = `${header}\nA11Y159,1,40000000-0000-4000-8000-000000000001,2095-01-01,2095-01-01,CAD,revenue,100.00,approved,actual`;
  const chooser = page.waitForEvent("filechooser");
  await page.getByLabel("CSV file").click();
  await (await chooser).setFiles({ name: "a11y-159-preview.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preview ready" })).toBeVisible();
  await page.getByRole("button", { name: "Accept import" }).click();
  const dialog = page.getByRole("dialog", { name: "Accept this accounting import?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await scan(page, "open Accept import dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Accept import" })).toBeFocused();
});
