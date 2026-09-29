import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { signInAsDirector } from "./auth";

test("non-WhatsApp receipt stays an integration draft while a supply request stays operational", async ({ page }) => {
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!apiUrl || !secretKey) throw new Error("Local E2E Supabase is required.");
  const admin = createClient(apiUrl, secretKey, { auth: { persistSession: false } });
  const accountId = randomUUID();
  const eventId = randomUUID();
  const receiptId = randomUUID();
  const supplyId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const siteId = "40000000-0000-4000-8000-000000000001";
  const receiptText = `Fuel receipt from synthetic email ${suffix}`;
  const supplyText = `Need supplies for synthetic site ${suffix}`;
  const account = await admin.from("integration_accounts").insert({
    id: accountId, organization_id: organizationId, site_id: siteId,
    provider: "event_adapter", external_account_id: `email-e2e-${suffix}`,
    display_name: "Synthetic email E2E",
  });
  if (account.error) throw account.error;
  try {
    const event = await admin.from("integration_webhook_events").insert({
      id: eventId, organization_id: organizationId, integration_account_id: accountId,
      dedupe_key: `email-e2e-${suffix}`, payload: {}, payload_sha256: "a".repeat(64),
    });
    if (event.error) throw event.error;
    const provenance = await admin.from("integration_adapter_event_provenance").insert({
      integration_event_id: eventId, organization_id: organizationId,
      source: "email", source_event_id: `email-e2e-${suffix}`, synthetic: true,
    });
    if (provenance.error) throw provenance.error;
    const messages = await admin.from("external_messages").insert([
      { id: receiptId, organization_id: organizationId, integration_account_id: accountId,
        integration_event_id: eventId, external_message_id: `receipt-${suffix}`,
        external_thread_id: `thread-${suffix}`, sender_id: "Synthetic email sender",
        occurred_at: new Date().toISOString(), received_at: new Date().toISOString(),
        text_content: receiptText, media_refs: [] },
      { id: supplyId, organization_id: organizationId, integration_account_id: accountId,
        integration_event_id: eventId, external_message_id: `supply-${suffix}`,
        external_thread_id: `thread-${suffix}`, sender_id: "Synthetic email sender",
        occurred_at: new Date().toISOString(), received_at: new Date().toISOString(),
        text_content: supplyText, media_refs: [] },
    ]);
    if (messages.error) throw messages.error;

    await signInAsDirector(page);
    await page.goto("/finance/inbox");
    const receipt = page.locator("article.reviewCard").filter({ hasText: receiptText });
    await expect(receipt).toBeVisible();
    await expect(receipt.getByRole("heading", { name: "Integration candidate" })).toBeVisible();
    await expect(page.locator("article.reviewCard").filter({ hasText: supplyText })).toHaveCount(0);

    const drafts = await admin.from("finance_intake_items").select("source_message_id,source_kind,review_state")
      .in("source_message_id", [receiptId, supplyId]);
    if (drafts.error) throw drafts.error;
    expect(drafts.data).toEqual([{ source_message_id: receiptId,
      source_kind: "adapter", review_state: "pending" }]);
  } finally {
    const drafts = await admin.from("finance_intake_items").delete()
      .in("source_message_id", [receiptId, supplyId]);
    if (drafts.error) throw drafts.error;
    const event = await admin.from("integration_webhook_events").delete().eq("id", eventId);
    if (event.error) throw event.error;
    const account = await admin.from("integration_accounts").delete().eq("id", accountId);
    if (account.error) throw account.error;
  }
});
