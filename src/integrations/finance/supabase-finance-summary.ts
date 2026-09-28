import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AppAccessContext } from "@/services/access-context";
import { financeReviewRulesV1, summarizeSite, type SiteFinanceSummary } from "@/services/finance-summary";
import { optionalFinanceRows } from "@/services/finance-schema-availability";

const expectation = z.object({ site_id: z.uuid(), contract_version_id: z.uuid(),
  service_period: z.string(), amount: z.coerce.number(), currency: z.string() });
const contractVersionRef = z.object({ id: z.uuid(), contract_id: z.uuid(), site_id: z.uuid() });
const actual = z.object({ site_id: z.uuid(), service_period: z.string(), currency: z.string(),
  recognized_revenue: z.coerce.number(), direct_labour: z.coerce.number(), supplies: z.coerce.number(),
  repairs: z.coerce.number(), other_direct_cost: z.coerce.number(), completeness: z.string() });
const periodSite = z.object({ period_id: z.uuid(), site_id: z.uuid(), period_start: z.string(), currency: z.string(),
  state: z.string(), coverage: z.string(), unmatched_amount: z.coerce.number(),
  unallocated_source_amount: z.coerce.number(), stale: z.boolean() });
const intake = z.object({ id: z.uuid(), site_id: z.uuid().nullable(), review_state: z.string() });
const claim = z.object({ id: z.uuid(), site_id: z.uuid(), expense_date: z.string() });
const posting = z.object({ id: z.uuid(), claim_id: z.uuid(), site_id: z.uuid(), category: z.string(), currency: z.string(), amount: z.coerce.number() });
const labourEntry = z.object({ site_id: z.uuid(), total_cost: z.coerce.number() });
const timeEntry = z.object({ id: z.uuid(), site_id: z.uuid(), hours: z.coerce.number().nullable(), state: z.string(), exception_code: z.string().nullable() });
const repairLink = z.object({ asset_id: z.uuid(), site_id: z.uuid(), expense_posting_id: z.uuid() });
const review = z.object({ id: z.uuid(), site_id: z.uuid(), rule_id: z.string(), source_type: z.string(),
  source_id: z.uuid(), state: z.enum(["open", "snoozed", "resolved"]), owner_user_id: z.uuid(), updated_at: z.string() });
const reviewEvent = z.object({ review_id: z.uuid(), state: z.string(), note: z.string(),
  actor_user_id: z.uuid(), created_at: z.string() });
const supplyRequest = z.object({ site_id: z.uuid(), state: z.string() });

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>, schema: z.ZodType<T>): Promise<T[]> {
  const output: T[] = [];
  for (let from = 0; from < 10_000; from += 500) {
    const result = await query(from, from + 499);
    if (result.error) throw new Error(result.error.message ?? "Finance summary source is unavailable.");
    const page = z.array(schema).parse(result.data);
    output.push(...page);
    if (page.length < 500) return output;
  }
  throw new Error("Finance summary exceeded its review limit.");
}

async function optionalAll<T>(query: (from: number, to: number) => PromiseLike<{
  data: unknown; error: { message?: string; code?: string } | null }>, schema: z.ZodType<T>): Promise<{ rows: T[]; available: boolean }> {
  const first = await optionalFinanceRows(query(0, 499), z.array(schema));
  if (!first.available || first.rows.length < 500) return first;
  return { rows: await all(query, schema), available: true };
}

export async function getPreferredFinanceMonth(client: SupabaseClient, access: AppAccessContext): Promise<string> {
  const fallback = new Date().toISOString().slice(0, 7);
  if (!access.canViewFinance || !access.sites.length) return fallback;
  const permitted = new Set(access.sites.map(site => site.id));
  const periods = await all((from, to) => client.rpc("list_finance_period_site_status").range(from, to), periodSite);
  const ready = periods.filter(row => permitted.has(row.site_id) && row.state === "closed" && !row.stale && row.coverage === "complete")
    .map(row => row.period_start.slice(0, 7)).sort().reverse();
  return ready[0] ?? fallback;
}

export async function getFinanceSummary(client: SupabaseClient, access: AppAccessContext, month: string): Promise<SiteFinanceSummary[]> {
  if (!access.canViewFinance) throw new Error("Finance access required.");
  const siteIds = access.sites.map(site => site.id);
  if (!siteIds.length) return [];
  const monthEnd = new Date(`${month}-01T00:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const exclusiveEnd = monthEnd.toISOString().slice(0, 10);
  const previousMonth = new Date(`${month}-01T00:00:00Z`);
  previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
  const previousStart = previousMonth.toISOString().slice(0, 10);
  const lookback = new Date(`${month}-01T00:00:00Z`);
  lookback.setUTCMonth(lookback.getUTCMonth() - (financeReviewRulesV1.repeatRepair.lookbackMonths - 1));
  const [expectations, actuals, periods, intakes, claims, labour, time, repairLinks, reviewResult, supplyRequests] = await Promise.all([
    all((from, to) => client.from("contract_revenue_expectations")
      .select("site_id,contract_version_id,service_period,amount,currency").eq("organization_id", access.organizationId)
      .in("site_id", siteIds).eq("service_period", `${month}-01`).eq("is_current", true).range(from, to), expectation),
    all((from, to) => client.from("finance_reconciliations")
      .select("site_id,service_period,currency,recognized_revenue,direct_labour,supplies,repairs,other_direct_cost,completeness")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .eq("service_period", `${month}-01`).eq("is_current", true).range(from, to), actual),
    all((from, to) => client.rpc("list_finance_period_site_status").range(from, to), periodSite),
    all((from, to) => client.from("finance_intake_items").select("id,site_id,review_state")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .gte("created_at", `${month}-01`).lt("created_at", exclusiveEnd).range(from, to), intake),
    all((from, to) => client.from("expense_claims").select("id,site_id,expense_date")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .gte("expense_date", lookback.toISOString().slice(0, 10))
      .lt("expense_date", exclusiveEnd).range(from, to), claim),
    access.canEditFinance ? all((from, to) => client.from("labor_cost_entries")
      .select("site_id,total_cost").eq("organization_id", access.organizationId).in("site_id", siteIds)
      .gte("work_date", `${month}-01`).lt("work_date", exclusiveEnd).range(from, to), labourEntry) : Promise.resolve([]),
    all((from, to) => client.from("time_entries").select("id,site_id,hours,state,exception_code")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .gte("work_date", `${month}-01`).lt("work_date", exclusiveEnd).range(from, to), timeEntry),
    all((from, to) => client.from("equipment_repair_cost_links")
      .select("asset_id,site_id,expense_posting_id")
      .eq("organization_id", access.organizationId).in("site_id", siteIds).range(from, to), repairLink),
    optionalAll((from, to) => client.from("finance_exception_reviews")
      .select("id,site_id,rule_id,source_type,source_id,state,owner_user_id,updated_at")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .eq("period_start", `${month}-01`).range(from, to), review),
    all((from, to) => client.from("supply_requests").select("site_id,state")
      .eq("organization_id", access.organizationId).in("site_id", siteIds)
      .gte("created_at", `${month}-01`).lt("created_at", exclusiveEnd).range(from, to), supplyRequest),
  ]);
  const contractVersionIds = [...new Set(expectations.map(row => row.contract_version_id))];
  const contractVersions = contractVersionIds.length ? await all((from, to) => client.from("contract_versions")
    .select("id,contract_id,site_id").eq("organization_id", access.organizationId)
    .in("site_id", siteIds).in("id", contractVersionIds).range(from, to), contractVersionRef) : [];
  const reviews = reviewResult.rows;
  const claimIds = claims.map(row => row.id);
  const postings = (await Promise.all(Array.from({ length: Math.ceil(claimIds.length / 100) }, (_, index) =>
    all((from, to) => client.from("expense_postings").select("id,claim_id,site_id,category,currency,amount")
      .eq("organization_id", access.organizationId).in("claim_id", claimIds.slice(index * 100, index * 100 + 100))
      .range(from, to), posting)))).flat();
  const reviewIds = reviews.map(row => row.id);
  const history = reviewIds.length ? (await optionalAll((from, to) => client.from("finance_exception_review_events")
    .select("review_id,state,note,actor_user_id,created_at")
    .eq("organization_id", access.organizationId).in("review_id", reviewIds)
    .range(from, to), reviewEvent)).rows : [];
  const claimById = new Map(claims.map(row => [row.id, row]));
  const postingById = new Map(postings.map(row => [row.id, row]));
  return access.sites.map(site => {
    const expected = expectations.filter(row => row.site_id === site.id);
    const expectedVersionIds = new Set(expected.map(row => row.contract_version_id));
    const expectedContractIds = [...new Set(contractVersions.filter(row => row.site_id === site.id
      && expectedVersionIds.has(row.id)).map(row => row.contract_id))];
    const siteActuals = actuals.filter(row => row.site_id === site.id);
    const currencies = new Set([...expected.map(row => row.currency), ...siteActuals.map(row => row.currency)]);
    const mismatch = currencies.size > 1 || siteActuals.length > 1;
    const currency = currencies.values().next().value ?? "CAD";
    const actualRow = !mismatch ? siteActuals[0] : undefined;
    const period = periods.find(row => row.site_id === site.id && row.period_start === `${month}-01` && row.currency === currency);
    const sitePostings = postings.filter(row => row.site_id === site.id
      && (claimById.get(row.claim_id)?.expense_date ?? "") >= `${month}-01`);
    const postingCurrencies = new Set(sitePostings.map(row => row.currency));
    const operationalCurrency = postingCurrencies.size > 1 ? null : postingCurrencies.values().next().value ?? currency;
    const category = (...names: string[]) => sitePostings.filter(row => names.includes(row.category))
      .reduce((sum, row) => sum + row.amount, 0);
    const siteTime = time.filter(row => row.site_id === site.id);
    const siteLabour = labour.filter(row => row.site_id === site.id);
    const priorSupplies = postings.filter(row => row.site_id === site.id && row.category === "supplies"
      && row.currency === currency
      && (claimById.get(row.claim_id)?.expense_date ?? "") >= previousStart
      && (claimById.get(row.claim_id)?.expense_date ?? "") < `${month}-01`);
    const currentSupplies = sitePostings.filter(row => row.category === "supplies" && row.currency === currency);
    const currentSupply = currentSupplies
      .sort((left, right) => right.amount - left.amount || left.id.localeCompare(right.id))[0];
    const currentRepairLinks = repairLinks.filter(row => row.site_id === site.id
      && postingById.has(row.expense_posting_id));
    const assetIds = [...new Set(currentRepairLinks.map(row => row.asset_id))];
    const repeatRepair = assetIds.map(assetId => {
      const linked = currentRepairLinks.filter(row => row.asset_id === assetId);
      const linkedPostings = linked.map(row => postingById.get(row.expense_posting_id))
        .filter((row): row is z.infer<typeof posting> => Boolean(row))
        .filter(row => row.currency === currency);
      return { assetId, repairCount: linkedPostings.length,
        totalCost: linkedPostings.reduce((sum, row) => sum + row.amount, 0),
        latestThisMonth: linkedPostings.some(row => (claimById.get(row.claim_id)?.expense_date ?? "") >= `${month}-01`) };
    }).filter(row => row.repairCount >= financeReviewRulesV1.repeatRepair.minimumCount
      && row.latestThisMonth)
      .sort((left, right) => right.repairCount - left.repairCount
        || right.totalCost - left.totalCost || left.assetId.localeCompare(right.assetId))[0];
    const pendingIntake = intakes.find(row => row.site_id === site.id
      && !["posted", "rejected"].includes(row.review_state));
    const exceptions = siteTime.filter(row => row.exception_code);
    const summary = summarizeSite({ siteId: site.id, siteName: site.name, period: month,
      periodId: period?.period_id ?? null, currency,
      expectedRevenue: expected.length && !mismatch ? expected.reduce((sum, row) => sum + row.amount, 0) : null,
      recognizedRevenue: actualRow?.recognized_revenue ?? null,
      labour: actualRow?.direct_labour ?? null, supplies: actualRow?.supplies ?? null,
      repairs: actualRow?.repairs ?? null, otherDirectCost: actualRow?.other_direct_cost ?? null,
      completeness: mismatch ? "currency mismatch" : actualRow?.completeness ?? "no accepted import",
      periodState: period?.state ?? null, stale: period?.stale ?? false,
      unmatchedAmount: period?.unmatched_amount ?? null,
      pendingExpenseCount: intakes.filter(row => row.site_id === site.id && !["posted", "rejected"].includes(row.review_state)).length,
      pendingSupplyRequestCount: supplyRequests.filter(row => row.site_id === site.id
        && !["received", "cancelled", "rejected"].includes(row.state)).length,
      approvedOperational: {
        labour: access.canEditFinance && siteLabour.length ? siteLabour.reduce((sum, row) => sum + row.total_cost, 0) : null,
        approvedHours: siteTime.some(row => ["approved", "posted"].includes(row.state))
          ? siteTime.filter(row => ["approved", "posted"].includes(row.state))
            .reduce((sum, row) => sum + (row.hours ?? 0), 0) : null,
        supplies: category("supplies"), repairs: category("equipment_repair"),
        fuelTravel: category("fuel_travel", "parking_tolls"), meals: category("meals"),
        other: category("contractor", "other_direct"), assetReview: category("equipment_purchase"),
        currency: operationalCurrency,
      },
    }, { priorSupplyCost: priorSupplies.reduce((sum, row) => sum + row.amount, 0),
      revenueContractId: expectedContractIds.length === 1 ? expectedContractIds[0] : undefined,
      currentSupplyCount: currentSupplies.length,
      currentSupplyClaimId: currentSupply?.claim_id,
      pendingIntakeId: pendingIntake?.id,
      repeatRepair,
      timeException: exceptions[0] ? { entryId: exceptions[0].id,
        count: exceptions.length, code: exceptions[0].exception_code ?? "time" } : undefined });
    return { ...summary, reviewAvailable: reviewResult.available, flags: summary.flags.map(flag => {
      const stored = reviews.find(row => row.site_id === site.id && row.rule_id === flag.code
        && row.source_type === flag.sourceType && row.source_id === flag.sourceId);
      return stored ? { ...flag, review: { state: stored.state, ownerUserId: stored.owner_user_id,
        updatedAt: stored.updated_at, history: history.filter(event => event.review_id === stored.id)
          .map(event => ({ state: event.state, note: event.note,
            actorUserId: event.actor_user_id, createdAt: event.created_at })) } } : flag;
    }) };
  });
}
