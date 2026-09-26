import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppAccessContext } from "@/services/access-context";
import { getFinanceSummary } from "@/integrations/finance/supabase-finance-summary";

const siteId = "10000000-0000-4000-8000-000000000001";

class Query {
  constructor(private readonly table: string, private readonly missingCode: string) {}
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  gte() { return this; }
  lt() { return this; }
  async range() {
    const missing = ["equipment_repair_cost_links", "finance_exception_reviews", "supply_requests"].includes(this.table);
    return missing
      ? { data: null, error: { code: this.missingCode, message: "table unavailable" } }
      : { data: [], error: null };
  }
}

function clientWithLaggingSchema(code: string): SupabaseClient {
  return {
    from: (table: string) => new Query(table, code),
    rpc: (name: string) => new Query(name, code),
  } as unknown as SupabaseClient;
}

const access = {
  canViewFinance: true,
  canEditFinance: false,
  organizationId: "10000000-0000-4000-8000-000000000002",
  sites: [{ id: siteId, name: "Synthetic Casino" }],
} as AppAccessContext;

describe("finance overview during a staged schema rollout", () => {
  it.each(["PGRST205", "42P01"])("shows missing supply and repair sources as unavailable (%s)", async code => {
    const [summary] = await getFinanceSummary(clientWithLaggingSchema(code), access, "2026-08");
    expect(summary.siteId).toBe(siteId);
    expect(summary.pendingSupplyRequestCount).toBeNull();
    expect(summary.equipmentReviewAvailable).toBe(false);
    expect(summary.reviewAvailable).toBe(false);
  });

  it("still rejects an access error from an optional source", async () => {
    await expect(getFinanceSummary(clientWithLaggingSchema("42501"), access, "2026-08"))
      .rejects.toThrow("table unavailable");
  });
});
