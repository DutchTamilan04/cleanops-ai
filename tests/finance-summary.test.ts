import { describe, expect, it } from "vitest";
import { combineSites, summarizeSite } from "../src/services/finance-summary";

const base = {
  siteId: "site-1", siteName: "Synthetic site", period: "2026-07", currency: "CAD",
  expectedRevenue: 1200, recognizedRevenue: 1000, labour: 300, supplies: 100,
  repairs: 50, otherDirectCost: 50, completeness: "complete", periodState: "closed",
  stale: false, unmatchedAmount: 0, pendingExpenseCount: 0,
  approvedOperational: { labour: 300, approvedHours: 10, supplies: 40, repairs: 50,
    fuelTravel: 30, meals: 15, other: 0, assetReview: 0, currency: "CAD" },
};

describe("finance summary", () => {
  it("computes source-backed contribution after complete close", () => {
    const site = summarizeSite(base);
    expect(site.contribution).toBe(500);
    expect(site.margin).toBe(0.5);
    expect(site.flags.map(flag => flag.code)).toContain("revenue-variance-v1");
  });

  it("withholds contribution for incomplete, stale, or missing revenue", () => {
    for (const change of [{ completeness: "incomplete" }, { stale: true }, { recognizedRevenue: null }, { periodState: "open" }]) {
      expect(summarizeSite({ ...base, ...change }).contribution).toBeNull();
    }
  });

  it("aggregates numerators before computing multi-site margin", () => {
    const combined = combineSites([summarizeSite(base), summarizeSite({ ...base, siteId: "site-2", recognizedRevenue: 500, labour: 100, supplies: 50, repairs: 0, otherDirectCost: 0 })]);
    expect(combined.recognizedRevenue).toBe(1500);
    expect(combined.contribution).toBe(850);
    expect(combined.margin).toBeCloseTo(850 / 1500);
  });

  it("does not combine incomplete or mixed-currency sites", () => {
    expect(combineSites([summarizeSite(base), summarizeSite({ ...base, siteId: "site-2", currency: "USD" })]).contribution).toBeNull();
    const partial = combineSites([summarizeSite(base), summarizeSite({ ...base, siteId: "site-2", stale: true })]);
    expect(partial.contribution).toBeNull();
    expect(partial.coveredSiteCount).toBe(1);
    expect(partial.selectedSiteCount).toBe(2);
    expect(partial.coveredContribution).toBe(500);
  });

  it("explains source-backed supply and repeat-repair flags with record links", () => {
    const site = summarizeSite({ ...base,
      approvedOperational: { ...base.approvedOperational, supplies: 6500, approvedHours: null } },
    { priorSupplyCost: 73.05, currentSupplyCount: 1,
      currentSupplyClaimId: "claim-supply", repeatRepair: {
        assetId: "asset-repair", repairCount: 2, totalCost: 218.11, latestThisMonth: true },
      timeException: { entryId: "time-1", count: 1, code: "missing_checkout" } });
    expect(site.flags.find(flag => flag.code === "supply-spike-v1")).toMatchObject({
      observed: 6500, baseline: 73.05, sampleSize: 1,
      sourceType: "expense_claim", sourceId: "claim-supply", href: "/finance/expenses#claim-supply" });
    expect(site.flags.find(flag => flag.code === "repeat-repair-v1")).toMatchObject({
      observed: 2, baseline: 1, sourceType: "equipment_asset", href: "/equipment/asset-repair" });
    expect(site.flags.find(flag => flag.code === "time-exception-v1")?.href)
      .toBe("/finance/time?siteId=site-1#time-1");
    expect(site.approvedOperational.approvedHours).toBeNull();
  });

  it("does not call new spend a month-over-month spike without a baseline", () => {
    expect(summarizeSite({ ...base,
      approvedOperational: { ...base.approvedOperational, supplies: 6500 } },
    { priorSupplyCost: 0, currentSupplyCount: 1, currentSupplyClaimId: "claim-supply" })
      .flags.some(flag => flag.code === "supply-spike-v1")).toBe(false);
  });

  it("uses the versioned supply boundary and suppresses mixed-currency comparisons", () => {
    const signals = { priorSupplyCost: 75, currentSupplyCount: 1, currentSupplyClaimId: "claim-supply" };
    const supplyFlag = (cost: number, currency = "CAD") => summarizeSite({ ...base,
      approvedOperational: { ...base.approvedOperational, supplies: cost, currency } }, signals)
      .flags.some(flag => flag.code === "supply-spike-v1");
    expect(supplyFlag(149.99)).toBe(false);
    expect(supplyFlag(150)).toBe(true);
    expect(supplyFlag(150, "USD")).toBe(false);
  });
});
