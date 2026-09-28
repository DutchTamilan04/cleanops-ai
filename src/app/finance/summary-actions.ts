"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getFinanceSummary } from "@/integrations/finance/supabase-finance-summary";

const reviewInput = z.object({
  siteId: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  ruleId: z.enum(["stale-close-v1", "unmatched-cost-v1", "pending-intake-v1",
    "supply-spike-v1", "repeat-repair-v1", "revenue-variance-v1", "time-exception-v1"]),
  sourceType: z.enum(["site", "expense_claim", "equipment_asset", "finance_intake_item", "time_entry"]),
  sourceId: z.uuid(),
  state: z.enum(["open", "snoozed", "resolved"]),
  note: z.string().trim().max(1000),
}).refine(value => value.state === "open" || value.note.length >= 4,
  { path: ["note"], message: "Give a reason when snoozing or resolving a prompt." });

export async function reviewFinanceException(formData: FormData): Promise<void> {
  const input = reviewInput.parse({
    siteId: formData.get("siteId"), month: formData.get("month"),
    ruleId: formData.get("ruleId"), sourceType: formData.get("sourceType"),
    sourceId: formData.get("sourceId"), state: formData.get("state"),
    note: formData.get("note"),
  });
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  if (!access.canViewFinance || !access.sites.some(site => site.id === input.siteId))
    throw new Error("Finance site access required.");
  const summary = await getFinanceSummary(client, access, input.month);
  const active = summary.find(site => site.siteId === input.siteId)?.flags.some(flag =>
    flag.code === input.ruleId && flag.sourceType === input.sourceType
      && flag.sourceId === input.sourceId);
  if (!active) throw new Error("This review prompt is no longer active. Refresh the finance page.");
  const { error } = await client.from("finance_exception_reviews").upsert({
    organization_id: access.organizationId,
    site_id: input.siteId,
    period_start: `${input.month}-01`,
    rule_id: input.ruleId,
    source_type: input.sourceType,
    source_id: input.sourceId,
    state: input.state,
    note: input.note,
    owner_user_id: access.userId,
    updated_by: access.userId,
  }, { onConflict: "organization_id,site_id,period_start,rule_id,source_type,source_id" });
  if (error) throw new Error("Could not save the review. Refresh and try again.");
  revalidatePath("/finance");
}
