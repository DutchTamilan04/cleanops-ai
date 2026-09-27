import { expect, test } from "@playwright/test";
import { signInAs, signInAsDirector } from "./auth";

test("Supervisor release remains a visible gate before the Client sees the redacted snapshot", async ({ page, browser }) => {
  await signInAs(page, process.env.CLEANOPS_E2E_SUPERVISOR_EMAIL);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Client report release" })).toBeVisible();
  await expect(page.getByText("Supervisor workspace: prepare, review and release", { exact: false })).toBeVisible();

  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  try {
    await signInAs(client, process.env.CLEANOPS_E2E_CLIENT_EMAIL);
    await client.goto("/reports/client");

    if (await page.getByRole("heading", { name: "No report prepared" }).isVisible()) {
      await expect(client.getByRole("heading", { name: "No released report" })).toBeVisible();
      const setupContext = await browser.newContext();
      const setup = await setupContext.newPage();
      try {
        await signInAsDirector(setup);
        await setup.goto("/incidents");
        await expect(setup.getByRole("heading", { name: "Incident & equipment desk" })).toBeVisible();
        if (await setup.getByRole("button", { name: "Record reported incident" }).isVisible()) {
          await setup.getByRole("button", { name: "Record reported incident" }).click();
          await expect(setup.getByText("Cause not determined.", { exact: false }).first()).toBeVisible();
        }
        if (await setup.getByRole("button", { name: "Record scrubber report" }).isVisible()) {
          await setup.getByRole("button", { name: "Record scrubber report" }).click();
          await expect(setup.getByText("No completed repair claimed")).toBeVisible();
        }
      } finally {
        await setupContext.close();
      }
      await page.goto("/reports");
      await page.getByRole("button", { name: "Prepare computed report" }).click();
      await expect(page.getByText("Shift report prepared from versioned task results.", { exact: false })).toBeVisible();
      await expect(page.locator(".ui-kpiCard", { hasText: "Incidents" }).locator(".ui-kpiCard-value")).toHaveText("1");
      await expect(page.locator(".ui-kpiCard", { hasText: "Equipment" }).locator(".ui-kpiCard-value")).toHaveText("1");
    }

    if (await page.getByRole("button", { name: "Release report to client" }).isVisible()) {
      await expect(page.locator(".releasePanel-draft .ui-alert-pending")).toContainText("Client access is still closed");
      await expect(page.getByText("Internal draft", { exact: true })).toBeVisible();
      await expect(page.locator(".ui-kpiCard-hero")).toContainText("SLA completion");
      await expect(page.getByText("N/A — scheduled safety checks are not implemented in this prototype.")).toBeVisible();
      await client.reload();
      await expect(client.getByRole("heading", { name: "No released report" })).toBeVisible();
      await page.screenshot({ path: "test-results/ui129-supervisor-draft-desktop.png", fullPage: true });
      await page.getByRole("button", { name: "Release report to client" }).click();
    }

    await expect(page.locator(".releasePanel-released .ui-alert-success")).toContainText("Client access enabled");
    await expect(page.getByText("Released", { exact: true }).first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/ui129-supervisor-released-mobile.png", fullPage: true });

    await client.reload();
    await expect(client.getByRole("heading", { name: "Aurora Downtown Demo" })).toBeVisible();
    await expect(client.getByText("Client view: released snapshot", { exact: false })).toBeVisible();
    await expect(client.locator(".ui-kpiCard-hero")).toContainText("Approved-on-time completion");
    await expect(client.locator(".clientSafety .ui-statusBadge-pending")).toHaveText("N/A");
    await expect(client.getByText("This client view contains the released redacted snapshot only.", { exact: false })).toBeVisible();
    await expect(client.getByText("I noticed a scratch", { exact: false })).toHaveCount(0);
    await client.screenshot({ path: "test-results/ui129-client-released-desktop.png", fullPage: true });
    await client.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => client.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await client.screenshot({ path: "test-results/ui129-client-released-mobile.png", fullPage: true });
  } finally {
    await clientContext.close();
  }
});
