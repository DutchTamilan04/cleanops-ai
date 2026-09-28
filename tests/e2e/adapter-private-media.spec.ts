import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { signInAsDirector } from "./auth";

const keyId = "adapter_e2e_key";
const secret = "local-only-adapter-e2e-secret-at-least-32-characters";
const organizationId = "10000000-0000-4000-8000-000000000001";
const siteId = "40000000-0000-4000-8000-000000000001";
const accountId = "c9700000-0000-4000-8000-000000000001";
const sourceAccountId = "adapter-private-media-e2e";

function headers(method: string, path: string, body = "") {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const digest = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", secret).update([
    method, path, keyId, timestamp, nonce, digest,
  ].join("\n")).digest("hex");
  return {
    "x-cleanops-key-id": keyId, "x-cleanops-timestamp": timestamp,
    "x-cleanops-nonce": nonce, "x-cleanops-signature": signature,
    ...(body ? { "content-type": "application/json" } : {}),
  };
}

test("signed adapter image is uploaded privately, verified and reviewable", async ({ page }) => {
  test.setTimeout(90_000);
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!apiUrl || !publicKey || !secretKey) throw new Error("Local E2E Supabase is required.");
  const admin = createClient(apiUrl, secretKey, { auth: { persistSession: false } });
  const account = await admin.from("integration_accounts").upsert({
    id: accountId, organization_id: organizationId, site_id: siteId,
    provider: "event_adapter", external_account_id: sourceAccountId,
    display_name: "E2E private media adapter",
  }, { onConflict: "id" });
  expect(account.error).toBeNull();
  const credential = await admin.from("integration_adapter_credentials").upsert({
    key_id: keyId, organization_id: organizationId,
    integration_account_id: accountId, site_id: siteId, source: "whatsapp",
    capabilities: ["message:write", "status:read"],
  }, { onConflict: "key_id" });
  expect(credential.error).toBeNull();

  const png = await sharp({ create: { width: 16, height: 16, channels: 4,
    background: { r: 22, g: 120, b: 88, alpha: 1 } } }).png().toBuffer();
  const eventId = `media-e2e-${randomBytes(8).toString("hex")}`;
  const body = JSON.stringify({
    schemaVersion: 1, source: "whatsapp", sourceAccountId,
    externalEventId: eventId, externalMessageId: eventId,
    threadId: "synthetic-e2e-thread", senderReference: "synthetic-e2e-worker",
    occurredAt: new Date().toISOString(), text: "Synthetic cleaning photo for private media E2E",
    media: [{ externalId: "photo-1", kind: "image", mimeType: "image/png",
      byteSize: png.byteLength, sha256: createHash("sha256").update(png).digest("hex") }],
    synthetic: true,
  });
  const accepted = await page.request.post("/api/integrations/events/v1", {
    data: body, headers: headers("POST", "/api/integrations/events/v1", body),
  });
  expect(accepted.status(), await accepted.text()).toBe(202);
  const { jobId } = await accepted.json() as { jobId: string };
  await expect.poll(async () => {
    const path = `/api/integrations/events/v1/jobs/${jobId}`;
    const response = await page.request.get(path, { headers: headers("GET", path) });
    expect(response.status(), await response.text()).toBe(200);
    return (await response.json() as { status?: string }).status;
  }, { timeout: 30_000 }).toBe("succeeded");

  const mediaPath = `/api/integrations/events/v1/jobs/${jobId}/media/photo-1`;
  const prepareBody = JSON.stringify({ action: "prepare" });
  const prepared = await page.request.post(mediaPath, {
    data: prepareBody, headers: headers("POST", mediaPath, prepareBody),
  });
  expect(prepared.status(), await prepared.text()).toBe(200);
  const ticket = await prepared.json() as { evidenceId: string; upload: {
    bucket: string; path: string; token: string;
  } };
  expect(ticket.upload.bucket).toBe("operational-evidence");
  const storage = createClient(apiUrl, publicKey, { auth: { persistSession: false } });
  const uploaded = await storage.storage.from(ticket.upload.bucket).uploadToSignedUrl(
    ticket.upload.path, ticket.upload.token, png, { contentType: "image/png" },
  );
  expect(uploaded.error).toBeNull();

  const finalizeBody = JSON.stringify({ action: "finalize" });
  const finalizations = await Promise.all([0, 1].map(() => page.request.post(mediaPath, {
    data: finalizeBody, headers: headers("POST", mediaPath, finalizeBody),
  })));
  for (const finalized of finalizations) {
    expect(finalized.status(), await finalized.text()).toBe(200);
    expect(await finalized.json()).toMatchObject({ evidenceId: ticket.evidenceId, status: "ready" });
  }
  const duplicate = await page.request.post(mediaPath, {
    data: finalizeBody, headers: headers("POST", mediaPath, finalizeBody),
  });
  expect(duplicate.status(), await duplicate.text()).toBe(200);
  const evidence = await admin.from("task_evidence").select("processing_status,site_id,sha256")
    .eq("id", ticket.evidenceId).single();
  expect(evidence.error).toBeNull();
  expect(evidence.data).toMatchObject({ processing_status: "ready", site_id: siteId,
    sha256: createHash("sha256").update(png).digest("hex") });

  const publicRead = await page.request.get(
    `${apiUrl}/storage/v1/object/public/${ticket.upload.bucket}/${ticket.upload.path}`,
  );
  expect(publicRead.ok()).toBe(false);
  await signInAsDirector(page);
  await page.goto("/operations");
  await expect(page.getByRole("heading").first()).toBeVisible();
});
