import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const uuid = z.string().uuid();
const itemSchema = z.object({
  context_id: uuid,
  sender_id: z.string(),
  text_content: z.string().nullable(),
  occurred_at: z.string(),
  intent_kind: z.string(),
  resolution_status: z.string(),
  media_count: z.number(),
  forwarded_by: z.string().nullable(),
});

export type UnassignedMessage = z.infer<typeof itemSchema>;

export async function listUnassignedMessages(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client.rpc("list_org_unassigned_messages", {
    p_organization_id: organizationId,
    p_limit: 50,
  });
  if (error) throw new Error("Unassigned messages could not be loaded.");
  const parsed = z.array(itemSchema).safeParse(data);
  if (!parsed.success) throw new Error("Unassigned messages did not match their contract.");
  return parsed.data;
}

export async function resolveUnassignedMessage(
  client: SupabaseClient,
  input: { organizationId: string; contextId: string; action: "assign" | "reject"; siteId: string | null; reason: string },
) {
  const { error } = await client.rpc("resolve_org_unassigned_message", {
    p_organization_id: input.organizationId,
    p_context_id: input.contextId,
    p_action: input.action,
    p_site_id: input.siteId,
    p_reason: input.reason,
  });
  if (error) {
    if (error.message.includes("message_already_resolved")) throw new Error("This message was already reviewed. Refresh the inbox.");
    if (error.message.includes("site_not_in_organization")) throw new Error("Choose a casino in this organization.");
    throw new Error("The message resolution could not be saved.");
  }
}
