import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signInAs, signInAsDirector } from "./auth";

test("Director assigns or rejects unassigned intake while Area Manager cannot see it", async ({ page, browser }) => {
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!apiUrl || !secretKey) throw new Error("Local E2E Supabase is required.");
  const admin = createClient(apiUrl, secretKey, { auth: { persistSession: false } });
  const eventId = randomUUID();
  const assignedId = randomUUID();
  const rejectedId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const orgId = "10000000-0000-4000-8000-000000000001";
  const siteId = "40000000-0000-4000-8000-000000000001";
  const accountId = "c0000000-0000-4000-8000-000000000001";
  const event = await admin.from("integration_webhook_events").insert({
    id: eventId, organization_id: orgId, integration_account_id: accountId,
    dedupe_key: `org-inbox-${suffix}`, payload: {}, payload_sha256: "a".repeat(64),
  });
  if (event.error) throw event.error;
  try {
    const provenance = await admin.from("integration_adapter_event_provenance").insert({
      integration_event_id: eventId, organization_id: orgId,
      source: "whatsapp", source_event_id: `org-inbox-${suffix}`,
      forwarded_by: "Synthetic supervisor forwarder", synthetic: true,
    });
    if (provenance.error) throw provenance.error;
    const messages = await admin.from("external_messages").insert([
      { id: assignedId, organization_id: orgId, integration_account_id: accountId,
        integration_event_id: eventId, external_message_id: `unassigned-a-${suffix}`,
        external_thread_id: `thread-a-${suffix}`, sender_id: "Synthetic unknown sender A",
        occurred_at: new Date().toISOString(), received_at: new Date().toISOString(),
        text_content: `Synthetic unassigned assignment ${suffix}`, media_refs: [] },
      { id: rejectedId, organization_id: orgId, integration_account_id: accountId,
        integration_event_id: eventId, external_message_id: `unassigned-b-${suffix}`,
        external_thread_id: `thread-b-${suffix}`, sender_id: "Synthetic unknown sender B",
        occurred_at: new Date().toISOString(), received_at: new Date().toISOString(),
        text_content: `Synthetic unassigned rejection ${suffix}`, media_refs: [] },
    ]);
    if (messages.error) throw messages.error;
    const contexts = await admin.from("external_message_contexts").update({
      site_id: null, zone_id: null, task_run_id: null, resolution_status: "unresolved",
    }).eq("organization_id", orgId).in("external_message_id", [assignedId, rejectedId]);
    if (contexts.error) throw contexts.error;

    await signInAsDirector(page);
    await page.goto("/operations/messages");
    await expect(page.getByRole("heading", { name: "Unassigned messages" })).toBeVisible();
    const assignment = page.locator("article.messageQueueItem").filter({ hasText: `Synthetic unassigned assignment ${suffix}` });
    const rejection = page.locator("article.messageQueueItem").filter({ hasText: `Synthetic unassigned rejection ${suffix}` });
    await expect(assignment).toBeVisible();
    await expect(rejection).toBeVisible();
    await expect(assignment.getByText("Forwarded by: Synthetic supervisor forwarder", { exact: false })).toBeVisible();
    await expect(assignment.getByText("Synthetic adapter event", { exact: false })).toBeVisible();
    const restrictedContext = await browser.newContext();
    try {
      const restricted = await restrictedContext.newPage();
      await signInAs(restricted, process.env.CLEANOPS_E2E_AREA_EMAIL);
      await restricted.goto("/operations/messages");
      await expect(restricted.getByRole("heading", { name: "Message inbox restricted" })).toBeVisible();
      await expect(restricted.getByText(`Synthetic unassigned assignment ${suffix}`)).toHaveCount(0);
    } finally { await restrictedContext.close(); }

    await assignment.getByRole("combobox", { name: "Casino" }).selectOption(siteId);
    await assignment.getByRole("textbox", { name: "Review reason" }).fill("Verified account and casino routing");
    await assignment.getByRole("button", { name: "Assign casino" }).click();
    await expect(page.getByText("Casino assigned. The message still needs site context review.")).toBeVisible();
    await page.goto(`/finance?siteId=${siteId}`);
    const siteMessage = page.locator("article.messageQueueItem").filter({ hasText: `Synthetic unassigned assignment ${suffix}` });
    await expect(siteMessage).toBeVisible();
    await expect(siteMessage.getByText("Synthetic unknown sender A")).toBeVisible();
    await expect(siteMessage.getByText("Forwarded by: Synthetic supervisor forwarder", { exact: false })).toBeVisible();
    await expect(siteMessage.getByText("Synthetic adapter event", { exact: false })).toBeVisible();

    await page.goto("/operations/messages");
    const pendingRejection = page.locator("article.messageQueueItem").filter({ hasText: `Synthetic unassigned rejection ${suffix}` });
    await pendingRejection.getByRole("textbox", { name: "Review reason" }).fill("Source account could not be verified");
    await pendingRejection.getByRole("button", { name: "Reject message" }).click();
    await expect(page.getByText("Message rejected and kept in the audit trail.")).toBeVisible();
    await expect(pendingRejection).toHaveCount(0);
    const audit = await admin.from("external_message_site_resolutions").select("action,reason").eq("organization_id", orgId)
      .in("context_id", (await admin.from("external_message_contexts").select("id")
        .in("external_message_id", [assignedId, rejectedId])).data?.map((row) => row.id) ?? []);
    if (audit.error) throw audit.error;
    expect(audit.data?.map((row) => row.action).sort()).toEqual(["assign", "reject"]);
  } finally {
    const cleanup = await admin.from("integration_webhook_events").delete().eq("id", eventId);
    if (cleanup.error) throw cleanup.error;
  }
});
