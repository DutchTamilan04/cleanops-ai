import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { signInAs, signInAsDirector } from "./auth";

test("Director finance remains scoped to the selected authorized casino", async ({ page }) => {
  await signInAsDirector(page);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance & inventory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inventory ledger" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Message context review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accounting CSV" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
  await expect(page.getByLabel("Combined finance result")).toBeVisible();
  await page.getByRole("combobox", { name: "Casino", exact: true }).selectOption("all");
  await page.getByRole("button", { name: "View finance" }).click();
  await expect(page.getByLabel("Combined finance result")).toBeVisible();
  await expect(page.getByLabel("Combined finance result").getByText("N/A").first()).toBeVisible();
  await expect(page.getByRole("table", { name: /Site comparison/ }).getByRole("row")).toHaveCount(3);
  await page.getByRole("textbox", { name: "Month" }).fill("2026-08");
  await page.getByRole("button", { name: "View finance" }).click();
  await expect(page).toHaveURL(/month=2026-08/);
  await expect(page.getByRole("table", { name: /Site comparison for 2026-08/ })).toBeVisible();

  await page.getByLabel("Choose casino").selectOption("40000000-0000-4000-8000-000000000002");
  await page.getByRole("button", { name: "Open casino" }).click();
  await expect(page).toHaveURL(/siteId=40000000-0000-4000-8000-000000000002/);
  await expect(page.getByText("Copper Peak East Demo").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Message context review" })).toBeVisible();
  await page.getByRole("link", { name: "Time", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Approved time and labour" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Casino", exact: true })).toHaveValue("40000000-0000-4000-8000-000000000002");
});

test("Director can reach a source and record review history for a finance prompt", async ({ page }) => {
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!apiUrl || !secretKey) throw new Error("Local E2E Supabase is required.");
  const admin = createClient(apiUrl, secretKey, { auth: { persistSession: false } });
  const membership = await admin.from("memberships").select("user_id")
    .eq("id", "20000000-0000-4000-8000-000000000001").single();
  if (membership.error || !membership.data.user_id) throw membership.error ?? new Error("Director test membership is missing.");
  const intakeId = randomUUID();
  const siteId = "40000000-0000-4000-8000-000000000001";
  const month = new Date().toISOString().slice(0, 7);
  const inserted = await admin.from("finance_intake_items").insert({
    id: intakeId, organization_id: "10000000-0000-4000-8000-000000000001",
    site_id: siteId, source_kind: "app", submitted_by: membership.data.user_id,
    source_text: "Synthetic browser test receipt awaiting review",
  });
  if (inserted.error) throw inserted.error;
  try {
    await signInAsDirector(page);
    await page.goto(`/finance?siteId=${siteId}&month=${month}`);
    const prompt = page.getByText("Finance intake needs review", { exact: true }).locator("..");
    await expect(prompt).toContainText("Rule pending-intake-v1");
    await prompt.getByRole("link", { name: "Open source record" }).click();
    await expect(page).toHaveURL(new RegExp(`/finance/inbox\\?siteId=${siteId}#${intakeId}`));
    await expect(page.locator(`[id="${intakeId}"]`)).toBeVisible();
    await page.goBack();
    const active = page.getByText("Finance intake needs review", { exact: true }).locator("..");
    await active.getByRole("combobox", { name: "Review state" }).selectOption("resolved");
    await active.getByRole("textbox", { name: "Reason or next step" }).fill("Source reviewed in finance inbox");
    await active.getByRole("button", { name: "Save review" }).click();
    await expect(page.getByText("Finance intake needs review", { exact: true }).locator(".."))
      .toContainText("Review: resolved");
    await expect(page.getByText("Finance intake needs review", { exact: true }).locator(".."))
      .toContainText("1 history event(s)");
  } finally {
    const reviewDelete = await admin.from("finance_exception_reviews").delete().eq("source_id", intakeId);
    if (reviewDelete.error) throw reviewDelete.error;
    const intakeDelete = await admin.from("finance_intake_items").delete().eq("id", intakeId);
    if (intakeDelete.error) throw intakeDelete.error;
  }
});

test("Finance comparison remains usable on a narrow viewport with keyboard controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsDirector(page);
  await page.goto("/finance?siteId=all&month=2026-08");
  const casino = page.getByRole("combobox", { name: "Casino", exact: true });
  await casino.focus();
  await expect(casino).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Month" })).toBeFocused();
  await expect(page.getByRole("table", { name: /Site comparison for 2026-08/ })).toBeVisible();
});

test("generated finance sources drive August contribution and September review prompts", async ({ page }) => {
  test.skip(process.env.CLEANOPS_E2E_SCENARIO !== "finance-showcase",
    "Requires a prior local demo:generate and demo:assert finance-showcase run.");
  const registry = JSON.parse(await readFile("fixtures/generated/finance-showcase/registry.json", "utf8"));
  const expected = JSON.parse(await readFile("fixtures/generated/finance-showcase/expected.json", "utf8"));
  if (registry.status !== "ready" || expected.generatorVersion < 9 || registry.runId !== expected.runId)
    throw new Error("A verified local version 9 finance showcase is required.");
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const password = process.env.CLEANOPS_DEMO_PASSWORD;
  if (!apiUrl || !secretKey || !password) throw new Error("Local E2E Supabase is required.");
  const admin = createClient(apiUrl, secretKey, { auth: { persistSession: false } });
  const provisioned = await admin.auth.admin.updateUserById(registry.authUserIds[0], {
    password, email_confirm: true,
  });
  if (provisioned.error) throw provisioned.error;

  await signInAs(page, "finance-showcase.darrel-director@cleanops.example.com");
  await page.goto("/finance?siteId=all&month=2026-08");
  const comparison = page.getByRole("table", { name: /Site comparison for 2026-08/ });
  const controls = expected.reconciliation.showcaseSites;
  for (const control of controls) {
    const row = comparison.getByRole("row").filter({ hasText:
      control.siteId === controls[0].siteId ? "Grand Villa Casino" : "River Rock Casino Resort" });
    await expect(row).toContainText(Number(control.contribution).toLocaleString("en-CA", {
      style: "currency", currency: "CAD" }));
  }
  await expect(page.getByLabel("Combined finance result")).toContainText("N/A");
  const riverRockId = controls[1].siteId;
  await page.goto(`/finance?siteId=${riverRockId}&month=2026-08`);
  const repairPrompt = page.getByText("Repeat asset repair cost", { exact: true }).locator("..");
  await expect(repairPrompt).toContainText("Rule repeat-repair-v1");
  await repairPrompt.getByRole("link", { name: "Open source record" }).click();
  await expect(page).toHaveURL(new RegExp(`/equipment/${expected.equipment.repairAssetId}`));
  await page.goto(`/finance?siteId=${riverRockId}&month=2026-09`);
  const supplyPrompt = page.getByText("Review supply expense movement", { exact: true }).locator("..");
  await expect(supplyPrompt).toContainText("Rule supply-spike-v1");
  await expect(supplyPrompt).toContainText("6500.00");
  await supplyPrompt.getByRole("link", { name: "Open source record" }).click();
  await expect(page).toHaveURL(/\/finance\/expenses#/);
});

test("Area Manager sees assigned site summary without confidential worker rates", async ({ page }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_AREA_EMAIL);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Worker cost rates" })).toHaveCount(0);
  await expect(page.getByText("Posted labour").first()).toBeVisible();
  await expect(page.getByText("Individual labour entries are restricted to Directors.", { exact: false })).toBeVisible();
});
