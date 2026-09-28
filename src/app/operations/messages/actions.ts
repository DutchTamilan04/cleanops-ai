"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveUnassignedMessage } from "@/integrations/messages/supabase-org-message-inbox";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, isSiteAllowed } from "@/services/access-context";

const inputSchema = z.object({
  contextId: z.string().uuid(),
  action: z.enum(["assign", "reject"]),
  siteId: z.string().uuid().nullable(),
  reason: z.string().trim().min(3).max(500),
}).strict().refine((value) => value.action === "assign" ? value.siteId !== null : value.siteId === null);

export async function performUnassignedMessageResolution(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a casino and enter a review reason." };
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (access.role !== "organization_administrator" ||
        (parsed.data.siteId && !isSiteAllowed(access, parsed.data.siteId))) {
      return { ok: false, message: "Director access to this organization is required." };
    }
    await resolveUnassignedMessage(client, {
      organizationId: access.organizationId,
      ...parsed.data,
    });
    revalidatePath("/operations/messages");
    if (parsed.data.siteId) revalidatePath("/finance");
    return { ok: true, message: parsed.data.action === "assign"
      ? "Casino assigned. The message still needs site context review."
      : "Message rejected and kept in the audit trail." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The review could not be saved." };
  }
}
