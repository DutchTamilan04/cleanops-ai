import Link from "next/link";
import { reviewFinanceException } from "@/app/finance/summary-actions";
import { combineSites, type SiteFinanceSummary } from "@/services/finance-summary";
import { Button, KpiCard, KpiCardGrid, SelectField, TextField } from "@/components/ui";

const amount = (value: number | null, currency: string) => value === null ? "N/A" :
  new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);

export function FinanceSummary({ sites, selectedSiteId, month }: {
  sites: SiteFinanceSummary[]; selectedSiteId: string | null; month: string;
}) {
  const visible = selectedSiteId ? sites.filter(site => site.siteId === selectedSiteId) : sites;
  const combined = combineSites(visible);
  return <section className="financePanel" aria-labelledby="finance-summary-title">
    <div className="panelHeading"><div><p className="eyebrow">Source-backed management view</p>
      <h2 id="finance-summary-title">Finance overview</h2></div></div>
    <form method="get" className="financeForm">
      <SelectField label="Casino" name="siteId" defaultValue={selectedSiteId ?? "all"}>
        <option value="all">All assigned casinos</option>
        {sites.map(site => <option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}
      </SelectField>
      <TextField label="Month" name="month" type="month" defaultValue={month} required />
      <Button variant="secondary" type="submit">View finance</Button>
    </form>
    <p className="recordNote">Recognized contribution appears only after a complete accepted accounting import and a current closed finance period. Expected contract revenue is a separate projection. Direct contribution excludes overhead, depreciation and tax.</p>
    {visible.length > 1 && <KpiCardGrid ariaLabel="Combined finance result">
      <KpiCard label="Recognized revenue" value={amount(combined.recognizedRevenue, combined.currency ?? "CAD")} help="Confirmed by an accepted accounting file" />
      <KpiCard label="Direct contribution" value={amount(combined.contribution, combined.currency ?? "CAD")} help="Revenue less all accepted direct costs" />
      <KpiCard label="Margin" value={combined.margin === null ? "N/A" : `${(combined.margin * 100).toFixed(1)}%`} help="Contribution as a share of revenue" />
      <KpiCard label="Complete sites" value={`${combined.coveredSiteCount} of ${combined.selectedSiteCount}`} />
    </KpiCardGrid>}
    {visible.length > 1 && combined.coveredSiteCount > 0 && combined.coveredSiteCount < combined.selectedSiteCount &&
      <p className="recordNote">Covered sites only: {amount(combined.coveredRevenue, combined.currency ?? "CAD")} recognized revenue and {amount(combined.coveredContribution, combined.currency ?? "CAD")} direct contribution across {combined.coveredSiteCount} complete site(s). The combined result remains N/A until every selected site is complete.</p>}
    {visible.length > 1 && <div className="financeComparisonScroll"><table className="financeComparison">
      <caption>Site comparison for {month}. Approved operational expenses are separate from accepted accounting costs.</caption>
      <thead><tr><th scope="col">Casino</th><th scope="col">Revenue</th><th scope="col">Labour</th><th scope="col">Supply expense</th><th scope="col">Repair expense</th><th scope="col">Direct contribution</th><th scope="col">Supply expense per approved hour</th></tr></thead>
      <tbody>{visible.map(site => <tr key={site.siteId}>
        <th scope="row"><a href={`#finance-site-${site.siteId}`}>{site.siteName}</a></th>
        <td>{amount(site.recognizedRevenue, site.currency)}</td>
        <td>{amount(site.labour, site.currency)}</td>
        <td>{amount(site.approvedOperational.currency ? site.approvedOperational.supplies : null, site.approvedOperational.currency ?? site.currency)}</td>
        <td>{amount(site.approvedOperational.currency ? site.approvedOperational.repairs : null, site.approvedOperational.currency ?? site.currency)}</td>
        <td>{amount(site.contribution, site.currency)}</td>
        <td>{site.approvedOperational.approvedHours && site.approvedOperational.currency
          ? amount(site.approvedOperational.supplies / site.approvedOperational.approvedHours, site.approvedOperational.currency) : "N/A"}</td>
      </tr>)}</tbody>
    </table></div>}
    <div className="financeSummarySites">
      {visible.map(site => <article className="financePanel" key={site.siteId} id={`finance-site-${site.siteId}`}>
        <h3>{site.siteName}</h3>
        <p>{site.period} · {site.currency} · {site.completeness} · period {site.periodState ?? "not opened"}{site.stale ? " · stale close" : ""}</p>
        <KpiCardGrid>
          <KpiCard label="Expected contract revenue" value={amount(site.expectedRevenue, site.currency)} help="What the contract says you should earn" />
          <KpiCard label="Recognized revenue" value={amount(site.recognizedRevenue, site.currency)} help="Confirmed by an accepted accounting file" />
          <KpiCard label="Direct labour" value={amount(site.labour, site.currency)} help="Wages for the work done" />
          <KpiCard label="Supplies" value={amount(site.supplies, site.currency)} help="Cleaning products and materials" />
          <KpiCard label="Repairs" value={amount(site.repairs, site.currency)} help="Equipment fixes and maintenance" />
          <KpiCard label="Other direct cost" value={amount(site.otherDirectCost, site.currency)} help="Any other cost tied to this site" />
          <KpiCard label="Direct contribution" value={amount(site.contribution, site.currency)} help="Revenue less all accepted direct costs" />
          <KpiCard label="Margin" value={site.margin === null ? "N/A" : `${(site.margin * 100).toFixed(1)}%`} help="Contribution as a share of revenue" />
        </KpiCardGrid>
        <h4>Approved operational sources</h4>
        <p className="recordNote">Expense amounts use the claim&apos;s expense date. They are shown separately from accepted accounting costs and are never added twice to contribution. Worker-level rates remain Director-only.</p>
        <KpiCardGrid>
          <KpiCard label="Posted labour" value={amount(site.approvedOperational.labour, site.currency)} />
          <KpiCard label="Approved hours" value={site.approvedOperational.approvedHours === null ? "N/A" : site.approvedOperational.approvedHours.toFixed(2)} />
          <KpiCard label="Supply expenses" value={amount(site.approvedOperational.currency ? site.approvedOperational.supplies : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Repair expenses" value={amount(site.approvedOperational.currency ? site.approvedOperational.repairs : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Fuel and travel" value={amount(site.approvedOperational.currency ? site.approvedOperational.fuelTravel : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Meals" value={amount(site.approvedOperational.currency ? site.approvedOperational.meals : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Other direct expenses" value={amount(site.approvedOperational.currency ? site.approvedOperational.other : null, site.approvedOperational.currency ?? site.currency)} />
          <KpiCard label="Supply expense per approved hour" value={site.approvedOperational.approvedHours && site.approvedOperational.currency ? amount(site.approvedOperational.supplies / site.approvedOperational.approvedHours, site.approvedOperational.currency) : "N/A"} />
        </KpiCardGrid>
        {site.approvedOperational.assetReview > 0 && <p className="recordNote">{amount(site.approvedOperational.assetReview, site.approvedOperational.currency ?? site.currency)} equipment purchases await accounting/asset treatment and are excluded from direct cost.</p>}
        <p className="recordNote">{site.pendingExpenseCount} finance intake item(s) created this month awaiting resolution. {site.pendingSupplyRequestCount ?? "N/A"} supply request(s) created this month still pending or partially received. {site.unmatchedAmount === null ? "Reconciliation period not opened." : `${amount(site.unmatchedAmount, site.currency)} operational cost unmatched.`}</p>
        <p className="recordNote">Staffing coverage and notice acknowledgements: N/A for this finance period until period-scoped sources are connected. No green status is inferred.</p>
        {site.flags.length > 0 && <div aria-label={`${site.siteName} review prompts`}>
          <h4>Review prompts</h4>
          <ul>{site.flags.map(flag => <li key={flag.code}>
            <strong>{flag.label}</strong> · {flag.detail} <Link href={flag.href}>Open source record</Link>
            <p className="recordNote">Rule {flag.code} · {flag.period} · observed {flag.observed.toFixed(flag.unit === "money" ? 2 : 0)} {flag.unit === "money" ? site.currency : "count"} · baseline {flag.baseline === null ? "N/A" : flag.baseline.toFixed(flag.unit === "money" ? 2 : 0)} · {flag.sampleSize} current source(s).</p>
            <p className="recordNote">Review: {flag.review?.state ?? "open"}{flag.review ? ` · assigned manager ${flag.review.ownerUserId.slice(0, 8)} · ${flag.review.history.length} history event(s)` : " · unassigned"}</p>
            {flag.review && <details><summary>Review history</summary><ol>{flag.review.history.map((event, index) =>
              <li key={`${event.createdAt}-${index}`}>{event.createdAt} · {event.state} · manager {event.actorUserId.slice(0, 8)}{event.note ? ` · ${event.note}` : ""}</li>)}</ol></details>}
            {site.reviewAvailable === false ? <p className="recordNote">Review history is unavailable until the finance review migration is released.</p> :
            <form action={reviewFinanceException} className="financeExceptionForm">
              <input type="hidden" name="siteId" value={site.siteId} />
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="ruleId" value={flag.code} />
              <input type="hidden" name="sourceType" value={flag.sourceType} />
              <input type="hidden" name="sourceId" value={flag.sourceId} />
              <SelectField label="Review state" name="state" defaultValue={flag.review?.state ?? "open"}>
                <option value="open">Open / take ownership</option><option value="snoozed">Snoozed</option><option value="resolved">Resolved</option>
              </SelectField>
              <label className="ui-field"><span className="ui-field-label">Reason or next step</span><textarea className="ui-field-input" name="note" maxLength={1000} defaultValue="" placeholder="Required for snooze or resolve" /></label>
              <Button variant="secondary" type="submit">Save review</Button>
            </form>}
          </li>)}</ul>
          <p className="recordNote">Versioned review prompts require human judgment and do not imply wrongdoing. Reviewing a prompt does not change its source record.</p>
        </div>}
        <p><Link href="/finance/contracts">Contracts</Link> · <Link href="/finance/projects">Projects</Link> · <Link href="/finance/expenses">Expenses</Link> · <Link href={`/finance/time?siteId=${site.siteId}`}>Time</Link> · <Link href="/finance/reconciliation">Reconciliation</Link></p>
      </article>)}
    </div>
  </section>;
}
