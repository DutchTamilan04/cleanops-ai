import { expect, test } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

test("Director can inspect the shared inventory and labour edit fields", async ({ page }) => {
  await signInAsDirector(page);
  await page.goto("/finance?siteId=40000000-0000-4000-8000-000000000001");
  const itemName = `UI ledger ${Date.now()}`;
  const itemForm = page.locator("section.financePanel", { has: page.getByRole("heading", { name: "Add inventory item" }) }).locator("form");
  await itemForm.getByLabel("Name").fill(itemName);
  await itemForm.getByLabel("Unit").fill("case");
  await itemForm.getByRole("button", { name: "Add inventory item" }).click();
  await expect(page.getByText("Inventory item added to the organization catalogue.")).toBeVisible();

  await page.reload();
  const inventoryForm = page.locator("section.financePanel", { has: page.getByRole("heading", { name: "Inventory transaction" }) }).locator("form");
  await inventoryForm.getByLabel("Item").selectOption({ label: `${itemName} · case` });
  await inventoryForm.getByLabel("Quantity").fill("2");
  await inventoryForm.getByLabel("Unit cost").fill("3.50");
  await inventoryForm.getByLabel("Note").fill(itemName);
  await inventoryForm.getByRole("button", { name: "Record inventory" }).click();
  await expect(page.getByText("Inventory transaction recorded. Its total cost is calculated by the database.")).toBeVisible();

  await page.reload();
  const inventoryLedger = page.locator("section.financeLedger", { has: page.getByRole("heading", { name: "Inventory ledger" }) });
  await inventoryLedger.getByLabel("Search inventory ledger").fill(itemName);
  await inventoryLedger.getByRole("button", { name: "Edit" }).click();
  const inventoryEdit = inventoryLedger.locator("form.financeEditRow");
  await expect(inventoryEdit.getByLabel("Item")).toHaveValue(/.+/);
  await expect(inventoryEdit.getByLabel("Quantity")).toHaveValue("2");
  await expect(inventoryEdit.getByLabel("Unit cost")).toHaveValue("3.5");
  await expect(inventoryEdit.locator(".ui-field-input")).toHaveCount(6);
  await page.screenshot({ path: "test-results/ui128-inventory-edit-desktop.png", fullPage: true });
  await inventoryEdit.getByRole("button", { name: "Cancel" }).click();

  const adjustment = page.locator("section.financePanel", { has: page.getByRole("heading", { name: "Direct labour cost adjustment" }) }).locator("form");
  await adjustment.getByLabel("Hours").fill("0.01");
  await adjustment.getByLabel("Hourly cost").fill("12.50");
  await adjustment.getByLabel("Adjustment reason or import reference").fill(itemName);
  await adjustment.getByRole("button", { name: "Record adjustment" }).click();
  await expect(page.getByText("Labour cost recorded. Hours and cost rate determine the saved total.")).toBeVisible();

  await page.reload();
  const labourLedger = page.locator("section.financeLedger", { has: page.getByRole("heading", { name: "Labour ledger" }) });
  await labourLedger.getByLabel("Search labour ledger").fill(itemName);
  await labourLedger.getByRole("button", { name: "Edit" }).click();
  const labourEdit = labourLedger.locator("form.financeEditRow");
  await expect(labourEdit.getByLabel("Hours")).toHaveValue("0.01");
  await expect(labourEdit.getByLabel("Hourly cost")).toHaveValue("12.5");
  await expect(labourEdit.locator(".ui-field-input")).toHaveCount(6);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(labourEdit.getByRole("button", { name: "Save" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/ui128-labour-edit-mobile.png", fullPage: true });
  await labourEdit.getByRole("button", { name: "Cancel" }).click();
});

test("Reconciliation controls remain Director-only on desktop and mobile", async ({ page }) => {
  await signInAsDirector(page);
  await page.goto("/finance/reconciliation");
  await expect(page.getByRole("heading", { name: "Accounting reconciliation and period close" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open a month" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Site status" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open or view period" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/ui128-reconciliation-mobile.png", fullPage: true });

  await signInAs(page, process.env.CLEANOPS_E2E_AREA_EMAIL);
  await page.goto("/finance/reconciliation");
  await expect(page.getByRole("heading", { name: "Accounting reconciliation and period close" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open a month" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close balanced period" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
