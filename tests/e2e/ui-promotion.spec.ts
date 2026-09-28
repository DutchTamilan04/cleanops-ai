import { expect, test } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

test("styled finance controls retain import acceptance and period close guards", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await signInAsDirector(page);
  await page.goto("/finance/reconciliation");
  await page.getByLabel("Month", { exact: true }).fill("2094-04");
  await page.getByRole("button", { name: "Open or view period" }).click();
  await expect(page.getByRole("heading", { name: "2094-04-01 close controls" })).toBeVisible();
  const controls = page.getByRole("heading", { name: "2094-04-01 close controls" }).locator("xpath=ancestor::section[1]");
  await expect(controls).toContainText("missing");
  await expect(controls).toContainText("A zero balance requires complete accepted coverage.");
  await controls.getByRole("button", { name: "Run deterministic matching" }).click();
  await expect(page.getByRole("status").filter({ hasText: "0 deterministic matches linked" })).toBeVisible();
  await controls.getByRole("button", { name: "Move to review" }).click();
  await controls.getByRole("button", { name: "Close balanced period" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "period has missing coverage or unresolved material amounts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);

  await page.goto("/finance");
  const header = "source_document_id,source_line_id,site_reference,service_period,accounting_period,currency,category,amount,approval_state,recognition_state";
  const csv = `${header}\nUI142,1,40000000-0000-4000-8000-000000000001,2094-04-01,2094-04-01,CAD,revenue,100.00,approved,actual\nUI142,2,40000000-0000-4000-8000-000000000002,2094-04-30,2094-04-01,CAD,revenue,200.00,approved,actual`;
  const chooser = page.waitForEvent("filechooser");
  await page.getByLabel("CSV file").click();
  await (await chooser).setFiles({ name: "ui142-complete-coverage.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preview ready" })).toBeVisible();
  await page.getByLabel("Import status").selectOption("complete");
  await page.getByRole("button", { name: "Accept import" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Finance import accepted and reconciled" })).toBeVisible();

  await page.getByRole("navigation", { name: "Finance sections" }).getByRole("link", { name: "Reconciliation" }).click();
  await expect(page).toHaveTitle("CleanOps");
  await expect(controls).toContainText("complete");
  await expect(page.getByRole("heading", { name: "Accepted accounting batches" }).locator("xpath=ancestor::section[1]").getByRole("table"))
    .toContainText("ui142-complete-coverage.csv");
  await controls.getByRole("button", { name: "Close balanced period" }).click();
  await expect(page.getByRole("status").filter({ hasText: "close saved" })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Link amount" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/ui142-reconciliation-desktop.png", fullPage: true });
  await controls.getByLabel("Correction reason").fill("Synthetic UI promotion correction check");
  await controls.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "reopen saved" })).toBeVisible();
  await expect(controls.getByRole("button", { name: "Move to review" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Accounting reconciliation and period close" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/ui142-reconciliation-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("new section tabs keep Operations Manager and supervisor within their existing access", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_OPERATIONS_EMAIL);
  await page.goto("/finance/contracts");
  let tabs = page.getByRole("navigation", { name: "Finance sections" });
  await expect(tabs.getByRole("link")).toHaveCount(2);
  await tabs.getByRole("link", { name: "Time & labour" }).click();
  await expect(page.getByRole("heading", { name: "Approved time and labour" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rates", exact: true })).toHaveCount(0);
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);
  await page.goto("/finance/time");
  tabs = page.getByRole("navigation", { name: "Finance sections" });
  await expect(tabs.getByRole("link")).toHaveCount(1);
  await expect(tabs.getByRole("link", { name: "Time & labour" })).toHaveAttribute("aria-current", "page");
});
