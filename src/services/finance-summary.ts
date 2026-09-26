export type Money = { amount: number; currency: string };

/** Synthetic review defaults; manager approval is required before production calibration. */
export const financeReviewRulesV1 = {
  revenueVariance: { minimumAmount: 100, expectedFraction: 0.1 },
  supplyMovement: { minimumAmount: 100, priorMonthMultiple: 2 },
  repeatRepair: { minimumCount: 2, lookbackMonths: 12 },
} as const;

export type FinanceFlag = {
  code: string; label: string; detail: string; href: string;
  observed: number; baseline: number | null; unit: "money" | "count";
  sampleSize: number; period: string;
  sourceType: "site" | "expense_claim" | "equipment_asset" | "finance_intake_item" | "time_entry";
  sourceId: string;
  review?: { state: "open" | "snoozed" | "resolved"; ownerUserId: string;
    updatedAt: string; history: { state: string; note: string; actorUserId: string; createdAt: string }[] };
};

export type FinanceSourceSignals = {
  priorSupplyCost?: number; currentSupplyCount?: number; currentSupplyClaimId?: string;
  pendingIntakeId?: string;
  repeatRepair?: { assetId: string; repairCount: number; totalCost: number; latestThisMonth: boolean };
  timeException?: { entryId: string; count: number; code: string };
};

export type SiteFinanceSummary = {
  siteId: string;
  siteName: string;
  period: string;
  currency: string;
  expectedRevenue: number | null;
  recognizedRevenue: number | null;
  labour: number | null;
  supplies: number | null;
  repairs: number | null;
  otherDirectCost: number | null;
  contribution: number | null;
  margin: number | null;
  completeness: string;
  periodState: string | null;
  stale: boolean;
  unmatchedAmount: number | null;
  pendingExpenseCount: number;
  pendingSupplyRequestCount?: number | null;
  equipmentReviewAvailable?: boolean;
  reviewAvailable?: boolean;
  approvedOperational: {
    labour: number | null;
    approvedHours: number | null;
    supplies: number;
    repairs: number;
    fuelTravel: number;
    meals: number;
    other: number;
    assetReview: number;
    currency: string | null;
  };
  flags: FinanceFlag[];
};

export function summarizeSite(input: Omit<SiteFinanceSummary, "contribution" | "margin" | "flags">,
  signals: FinanceSourceSignals = {}): SiteFinanceSummary {
  const complete = input.completeness === "complete" && input.periodState === "closed" && !input.stale;
  const costs = [input.labour, input.supplies, input.repairs, input.otherDirectCost];
  const contribution = complete && input.recognizedRevenue !== null && costs.every(value => value !== null)
    ? Math.round((input.recognizedRevenue - costs.reduce<number>((sum, value) => sum + (value ?? 0), 0)) * 100) / 100
    : null;
  const flags: FinanceFlag[] = [];
  const siteFlag = (code: string, label: string, detail: string, href: string,
    observed: number, baseline: number | null, unit: FinanceFlag["unit"], sampleSize: number): FinanceFlag =>
    ({ code, label, detail, href, observed, baseline, unit, sampleSize,
      period: input.period, sourceType: "site", sourceId: input.siteId });
  if (input.stale) flags.push(siteFlag("stale-close-v1", "Closed period needs review",
    "Accepted sources changed after close.", "/finance/reconciliation", 1, 0, "count", 1));
  if (input.unmatchedAmount !== null && input.unmatchedAmount > 0)
    flags.push(siteFlag("unmatched-cost-v1", "Unmatched operational cost",
      `${input.currency} ${input.unmatchedAmount.toFixed(2)} requires reconciliation.`,
      "/finance/reconciliation", input.unmatchedAmount, 0, "money", 1));
  if (input.pendingExpenseCount > 0) flags.push({ ...siteFlag("pending-intake-v1",
    "Finance intake needs review", `${input.pendingExpenseCount} candidate(s) await resolution.`,
    `/finance/inbox?siteId=${input.siteId}${signals.pendingIntakeId ? `#${signals.pendingIntakeId}` : ""}`,
    input.pendingExpenseCount, 0, "count", input.pendingExpenseCount),
    sourceType: signals.pendingIntakeId ? "finance_intake_item" : "site",
    sourceId: signals.pendingIntakeId ?? input.siteId });
  if (input.expectedRevenue !== null && input.recognizedRevenue !== null && input.expectedRevenue > 0 &&
    Math.abs(input.expectedRevenue - input.recognizedRevenue) >= Math.max(
      financeReviewRulesV1.revenueVariance.minimumAmount,
      input.expectedRevenue * financeReviewRulesV1.revenueVariance.expectedFraction))
    flags.push(siteFlag("revenue-variance-v1", "Expected and recognized revenue differ",
      `Expected ${input.currency} ${input.expectedRevenue.toFixed(2)}; recognized ${input.currency} ${input.recognizedRevenue.toFixed(2)}. Check contract and accounting sources.`,
      "/finance/contracts", Math.abs(input.expectedRevenue - input.recognizedRevenue),
      Math.max(financeReviewRulesV1.revenueVariance.minimumAmount,
        input.expectedRevenue * financeReviewRulesV1.revenueVariance.expectedFraction), "money", 2));
  if (signals.priorSupplyCost !== undefined && signals.priorSupplyCost > 0
    && input.approvedOperational.currency === input.currency
    && input.approvedOperational.supplies >= Math.max(
      financeReviewRulesV1.supplyMovement.minimumAmount,
      signals.priorSupplyCost * financeReviewRulesV1.supplyMovement.priorMonthMultiple)
    && signals.currentSupplyClaimId)
    flags.push({ code: "supply-spike-v1", label: "Review supply expense movement",
      detail: `${input.currency} ${input.approvedOperational.supplies.toFixed(2)} approved this month versus ${input.currency} ${signals.priorSupplyCost.toFixed(2)} in the previous month. These are expenses, not stock volume or consumption.`,
      href: `/finance/expenses#${signals.currentSupplyClaimId}`,
      observed: input.approvedOperational.supplies, baseline: signals.priorSupplyCost,
      unit: "money", sampleSize: signals.currentSupplyCount ?? 0, period: input.period,
      sourceType: "expense_claim", sourceId: signals.currentSupplyClaimId });
  if (signals.repeatRepair && signals.repeatRepair.repairCount >= financeReviewRulesV1.repeatRepair.minimumCount
    && signals.repeatRepair.latestThisMonth)
    flags.push({ code: "repeat-repair-v1", label: "Repeat asset repair cost",
      detail: `${signals.repeatRepair.repairCount} approved repair sources in the selected month and preceding 11 months total ${input.currency} ${signals.repeatRepair.totalCost.toFixed(2)} for one asset. Review the dated history and invoices.`,
      href: `/equipment/${signals.repeatRepair.assetId}`,
      observed: signals.repeatRepair.repairCount, baseline: 1, unit: "count",
      sampleSize: signals.repeatRepair.repairCount, period: input.period,
      sourceType: "equipment_asset", sourceId: signals.repeatRepair.assetId });
  if (signals.timeException)
    flags.push({ code: "time-exception-v1", label: "Time entry needs review",
      detail: `${signals.timeException.count} ${signals.timeException.code.replaceAll("_", " ")} exception(s) in the selected month. Review source hours before financial posting.`,
      href: `/finance/time?siteId=${input.siteId}#${signals.timeException.entryId}`,
      observed: signals.timeException.count, baseline: 0, unit: "count",
      sampleSize: signals.timeException.count, period: input.period,
      sourceType: "time_entry", sourceId: signals.timeException.entryId });
  return { ...input, flags, contribution, margin: contribution !== null && input.recognizedRevenue !== null && input.recognizedRevenue > 0
    ? contribution / input.recognizedRevenue : null };
}

export function combineSites(sites: SiteFinanceSummary[]) {
  const currency = sites[0]?.currency ?? null;
  const compatible = !!currency && sites.every(site => site.currency === currency);
  const covered = compatible ? sites.filter(site => site.contribution !== null) : [];
  const complete = compatible && covered.length === sites.length && sites.length > 0;
  const coveredRevenue = covered.reduce((sum, site) => sum + (site.recognizedRevenue ?? 0), 0);
  const coveredContribution = covered.reduce((sum, site) => sum + (site.contribution ?? 0), 0);
  const recognizedRevenue = complete ? coveredRevenue : null;
  const contribution = complete ? coveredContribution : null;
  return { currency: compatible ? currency : null, recognizedRevenue, contribution,
    margin: recognizedRevenue && contribution !== null ? contribution / recognizedRevenue : null,
    coveredSiteCount: covered.length, selectedSiteCount: sites.length,
    coveredRevenue: covered.length ? coveredRevenue : null,
    coveredContribution: covered.length ? coveredContribution : null };
}
