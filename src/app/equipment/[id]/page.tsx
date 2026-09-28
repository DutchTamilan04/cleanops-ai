import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, SelectField, StatusBadge, TextAreaField, TextField } from "@/components/ui";
import { assetConditionLabel, assetStatusLabel, readable } from "@/config/equipment-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getEquipmentAssetDetail } from "@/integrations/equipment/supabase-equipment";
import { saveEquipmentEvent } from "@/app/equipment/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function when(value: string | null) { return value ? new Date(value).toLocaleString("en-CA") : "Unknown"; }
function formKind(assetId: string, kind: string) { return <><input type="hidden" name="assetId" value={assetId} /><input type="hidden" name="kind" value={kind} /></>; }

function ActionCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return <form action={saveEquipmentEvent} className="actionCard">
    <h3>{title}</h3>{intro ? <p>{intro}</p> : null}{children}
  </form>;
}

function HistoryItem({ meta, children }: { meta: ReactNode; children?: ReactNode }) {
  return <li><div className="historyList-meta">{meta}</div>{children ? <p className="historyList-body">{children}</p> : null}</li>;
}

function AssetSection({ id, title, badge, records, actions }: {
  id: string; title: string; badge?: ReactNode; records: ReactNode; actions?: ReactNode;
}) {
  return <section className="assetSection" id={id} aria-labelledby={`${id}-title`}>
    <div className="financePanel">
      <div className="panelHeading"><h2 id={`${id}-title`}>{title}</h2>{badge}</div>
      {records}
    </div>
    {actions ? <div className="assetSection-actions">{actions}</div> : null}
  </section>;
}

const outcomeTone = (outcome: string) => outcome === "care_ok" ? "success" : outcome === "follow_up_required" ? "pending" : "neutral";

export default async function EquipmentDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const notice = await searchParams;
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const detail = z.string().uuid().safeParse(id).success ? await getEquipmentAssetDetail(client, access, id) : null;
  if (!detail) return <AppShell authenticated currentPath="/equipment" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState"><p className="eyebrow">Equipment care</p><h1>Asset unavailable</h1>
      <Alert tone="restricted">This asset is outside your assigned sites or does not exist.</Alert>
      <Link className="ui-button ui-button-secondary" href="/equipment">Back to asset register</Link></section>
  </AppShell>;
  const { asset, siteHistory, checklists, inspections, reports, actions, links, zones, workers,
    evidenceRows, evidenceLinks, postings, unlinkedReports, repairTerms, loadedAt } = detail;
  const siteNames = new Map(access.sites.map((site) => [site.id, site.name]));
  const canManage = ["site_supervisor", "area_manager", "operations_manager", "organization_administrator"].includes(access.role);
  const director = access.canEditFinance;
  const latestInspection = inspections[0];
  const overdue = latestInspection?.outcome === "follow_up_required" && latestInspection.follow_up_due_at &&
    new Date(latestInspection.follow_up_due_at).getTime() < new Date(loadedAt).getTime();
  const followUpOpen = latestInspection?.outcome === "follow_up_required";
  const postingById = new Map(postings.map((posting) => [posting.id, posting]));
  const linkedPostings = links.map((link) => postingById.get(link.expense_posting_id)).filter((posting) => posting !== undefined);
  const currency = linkedPostings.length && linkedPostings.every((posting) => posting.currency === linkedPostings[0].currency)
    ? linkedPostings[0].currency : null;
  const repairTotal = currency ? linkedPostings.reduce((sum, posting) => sum + posting.amount, 0) : null;
  const status = assetStatusLabel(asset.status);
  const condition = assetConditionLabel(asset.condition);
  const siteName = siteNames.get(asset.site_id) ?? "Assigned site";
  const model = `${asset.equipment_models?.manufacturer ?? "Unknown manufacturer"} ${asset.equipment_models?.model_name ?? "Unknown model"}`;
  const sections = [
    { href: "#care", label: "Care & inspections", count: inspections.length },
    { href: "#faults", label: "Faults & maintenance", count: reports.length },
    { href: "#costs", label: "Source costs" },
    { href: "#evidence", label: "Evidence", count: evidenceLinks.length },
    { href: "#history", label: "Site history", count: siteHistory.length },
  ];

  return <AppShell authenticated currentPath="/equipment" role={access.role} roleLabel={access.roleLabel}>
    <div className="pageStack assetDetail">
      <nav aria-label="Breadcrumb" className="ui-breadcrumb"><ol>
        <li><Link href="/equipment">Asset register</Link></li><li aria-current="page">{asset.asset_code}</li>
      </ol></nav>
      <header className="financeHeader">
        <div>
          <p className="eyebrow">Equipment care · {siteName}</p>
          <h1>{asset.asset_code}</h1>
          <p>{model}{asset.equipment_models?.category ? ` · ${asset.equipment_models.category}` : ""}</p>
        </div>
        <div className="ui-badgeRow">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <StatusBadge tone={condition.tone}>Condition: {condition.label}</StatusBadge>
          {overdue ? <StatusBadge tone="danger">Follow-up overdue</StatusBadge> : null}
        </div>
      </header>
      {notice.error ? <Alert tone="danger">{notice.error}</Alert> : null}
      {notice.saved ? <Alert tone="success">{notice.saved}</Alert> : null}
      <dl className="recordFacts assetFacts">
        <div><dt>Status</dt><dd>{status.label}</dd></div>
        <div><dt>Casino</dt><dd>{siteName}</dd></div>
        <div><dt>Acquired</dt><dd>{asset.acquired_on ?? "Unknown"}</dd></div>
        <div><dt>Runtime hours</dt><dd>{asset.runtime_hours ?? "Unknown"}</dd></div>
        <div><dt>Last service</dt><dd>{asset.last_service_date ?? "Unknown"}</dd></div>
        <div><dt>Next service</dt><dd>{asset.next_service_date ?? "Not scheduled"}</dd></div>
      </dl>
      <Alert tone="info">Repeated faults indicate history for review. They do not identify staff causation or prove a repair is complete.</Alert>
      <nav aria-label="Asset sections" className="ui-sectionTabs"><ul>
        {sections.map((section) => <li key={section.href}><a className="ui-sectionTab" href={section.href}>{section.label}
          {typeof section.count === "number" ? <span className="ui-sectionTab-count">{section.count}</span> : null}</a></li>)}
      </ul></nav>

      <AssetSection id="care" title="Care and follow-up"
        badge={overdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : followUpOpen ? <StatusBadge tone="pending">Follow-up open</StatusBadge>
          : latestInspection ? <StatusBadge tone="success">Latest: care OK</StatusBadge> : <StatusBadge tone="neutral">Not inspected</StatusBadge>}
        records={<>
          <p className="panelIntro">{inspections.length ? `${inspections.length} recorded inspection${inspections.length === 1 ? "" : "s"}.` : "No post-use inspection recorded."} {overdue ? "Latest follow-up is overdue." : followUpOpen ? "Follow-up is open." : ""}</p>
          {checklists.length
            ? <p className="panelIntro">Current source-backed checklist: v{checklists[0].version_number}, {readable(checklists[0].source_kind)}, {checklists[0].source_reference}.</p>
            : <Alert tone="pending">No approved checklist version is available for this model. Do not assume a manufacturer procedure.</Alert>}
          {inspections.length ? <ol className="historyList" aria-label="Inspections">{inspections.map((inspection) => <HistoryItem key={inspection.id}
            meta={<><time>{when(inspection.inspected_at)}</time><StatusBadge tone={outcomeTone(inspection.outcome)}>{readable(inspection.outcome)}</StatusBadge>
              {inspection.follow_up_due_at ? <span>Follow-up due {when(inspection.follow_up_due_at)}</span> : null}</>}>
            Inspector {inspection.inspector_user_id.slice(0, 8)}{inspection.operator_user_id ? ` · operator ${inspection.operator_user_id.slice(0, 8)}` : " · operator not recorded"}
            {inspection.notes ? ` · ${inspection.notes}` : ""}
          </HistoryItem>)}</ol> : null}
        </>}
        actions={<>
          {canManage && checklists.length > 0 ? <ActionCard title="Record post-use inspection" intro={`Use checklist version ${checklists[0].version_number}: ${checklists[0].source_reference}.`}>
            {formKind(asset.id, "inspection")}<input type="hidden" name="checklistId" value={checklists[0].id} />
            <SelectField label="Operator, if known" name="operatorId"><option value="">Unknown</option>{workers.filter((worker) => worker.auth_user_id && worker.auth_user_id !== access.userId).map((worker) => <option key={worker.id} value={worker.auth_user_id ?? ""}>{worker.display_name}</option>)}</SelectField>
            <SelectField label="Outcome" name="outcome"><option value="care_ok">Care OK</option><option value="follow_up_required">Follow-up required</option></SelectField>
            <fieldset className="actionCard-steps"><legend>Approved checklist steps</legend>{checklists[0].instructions.map((step, index) =>
              <SelectField key={index} label={typeof step === "string" ? step : `Step ${index + 1}`} name={`step-${index}`} required>
                <option value="care_ok">Care OK</option><option value="follow_up_required">Follow-up required</option><option value="not_checked">Not checked</option>
              </SelectField>)}</fieldset>
            <TextAreaField label="Notes" name="notes" />
            <TextField label="Follow-up due" name="followUpDueAt" type="datetime-local" />
            <Button variant="primary" type="submit">Save inspection</Button>
          </ActionCard> : null}
          {director ? <ActionCard title="Approve source-backed checklist version" intro="Enter only steps from a manufacturer document or customer-approved source. A new version preserves prior inspections.">
            {formKind(asset.id, "checklist")}<input type="hidden" name="modelId" value={asset.model_id} />
            <SelectField label="Source" name="sourceKind"><option value="manufacturer">Manufacturer</option><option value="customer_approved">Customer approved</option></SelectField>
            <TextField label="Document/reference" name="sourceReference" minLength={3} required />
            <TextAreaField label="Source instructions, one per line" name="instructions" required />
            <Button variant="secondary" type="submit">Approve checklist version</Button>
          </ActionCard> : null}
        </>} />

      <AssetSection id="faults" title="Faults and maintenance"
        badge={reports.length >= 2 ? <StatusBadge tone="pending">Repeat issue · review</StatusBadge> : <StatusBadge tone="neutral">{reports.length} {reports.length === 1 ? "report" : "reports"}</StatusBadge>}
        records={<>
          <p className="panelIntro">{reports.length >= 2 ? `${reports.length} attributed fault reports; repeat issue requires review.` : reports.length === 1 ? "One attributed fault report." : "No linked fault report."}</p>
          {reports.length ? <><h3 className="historyHeading">Fault reports</h3><ol className="historyList" aria-label="Fault reports">{reports.map((report) => <HistoryItem key={report.id}
            meta={<><time>{when(report.reported_at)}</time><StatusBadge tone={["resolved", "closed", "returned_to_service"].includes(report.state) ? "success" : "pending"}>{readable(report.state)}</StatusBadge><span>Reported by {report.created_by.slice(0, 8)}</span></>}>
            {report.issue_description}
          </HistoryItem>)}</ol></> : null}
          {actions.length ? <><h3 className="historyHeading">Maintenance events</h3><ol className="historyList" aria-label="Maintenance events">{actions.map((action) => <HistoryItem key={action.id}
            meta={<><time>{when(action.recorded_at)}</time><StatusBadge tone={action.action_kind === "return_to_service" || action.action_kind === "work_completed" ? "success" : "info"}>{readable(action.action_kind)}</StatusBadge><span>Actor {action.performed_by.slice(0, 8)}</span></>}>
            {action.notes}{action.vendor_reference ? ` · vendor reference ${action.vendor_reference}` : ""}{action.corrects_action_id ? ` · corrects ${action.corrects_action_id.slice(0, 8)}` : ""}
          </HistoryItem>)}</ol></> : null}
        </>}
        actions={<>
          {canManage && zones.length > 0 && workers.length > 0 ? <ActionCard title="Report a neutral fault" intro="Describe what was observed. Do not record a cause.">
            {formKind(asset.id, "fault")}<input type="hidden" name="eventKey" value={`asset-fault-${crypto.randomUUID()}`} />
            <SelectField label="Zone" name="zoneId">{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</SelectField>
            <SelectField label="Reporting worker" name="workerId">{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.display_name}</option>)}</SelectField>
            <TextAreaField label="Observed issue" name="description" minLength={3} required />
            <Button variant="primary" type="submit">Record fault</Button>
          </ActionCard> : null}
          {canManage && reports.length > 0 ? <ActionCard title="Record an attributed maintenance event" intro="Return to service needs an approver other than the person who recorded the work.">
            {formKind(asset.id, "maintenance")}<input type="hidden" name="eventKey" value={`asset-action-${crypto.randomUUID()}`} />
            <SelectField label="Fault" name="reportId">{reports.map((report) => <option key={report.id} value={report.id}>{report.issue_description.slice(0, 80)} · {readable(report.state)}</option>)}</SelectField>
            <SelectField label="Action" name="actionKind"><option value="triaged">Triaged</option><option value="maintenance_requested">Maintenance requested</option><option value="work_completed">Work completed with evidence</option><option value="return_to_service">Approve return to service</option><option value="correction">Correction event</option></SelectField>
            <TextAreaField label="Action notes" name="notes" minLength={3} required />
            <TextField label="Vendor/work reference" name="vendorReference" />
            <TextField label="Original action ID for correction" name="correctsActionId" />
            <Button variant="primary" type="submit">Save event</Button>
          </ActionCard> : null}
          {canManage && unlinkedReports.length > 0 ? <ActionCard title="Link an existing report">
            {formKind(asset.id, "linkFault")}
            <SelectField label="Unlinked site report" name="reportId">{unlinkedReports.map((report) => <option key={report.id} value={report.id}>{when(report.reported_at)} · {report.equipment_label}</option>)}</SelectField>
            <Button variant="secondary" type="submit">Link report to this asset</Button>
          </ActionCard> : null}
        </>} />

      <AssetSection id="costs" title="Source costs"
        badge={access.canViewFinance ? undefined : <StatusBadge tone="neutral">Finance roles only</StatusBadge>}
        records={<>
          <dl className="recordFacts">
            <div><dt>Contract repair responsibility</dt><dd>{repairTerms.length === 1 ? readable(repairTerms[0].repair_responsibility) : repairTerms.length > 1 ? "Multiple active contracts; review the relevant contract" : "Unknown"}</dd></div>
            {access.canViewFinance ? <div><dt>Linked approved repair expense</dt><dd>{repairTotal === null ? "N/A" : new Intl.NumberFormat("en-CA", { style: "currency", currency: currency ?? "CAD" }).format(repairTotal)}</dd></div> : null}
            {access.canViewFinance ? <div><dt>Cost per operating hour</dt><dd>N/A</dd></div> : null}
          </dl>
          <p className="panelIntro">Contract responsibility does not itself establish an invoice or payment.</p>
          {access.canViewFinance ? <>
            <p className="panelIntro">{repairTotal === null ? "No single-currency approved repair total is available." : "Linked approved operational repair expense at historical sites."} Accepted accounting rows are reconciliation evidence and are not added to this total. Cost per operating hour is unavailable until a reliable period usage denominator exists.</p>
            {links.length ? <ol className="historyList" aria-label="Linked repair costs">{links.map((link) => <HistoryItem key={link.id}
              meta={<><strong>{link.invoice_reference}</strong><span>{siteNames.get(link.site_id) ?? "Historical site"}</span>
                <StatusBadge tone={link.finance_source_row_id ? "info" : "neutral"}>{link.finance_source_row_id ? "Accounting source linked" : "Accounting source not linked"}</StatusBadge></>}>
              {postingById.get(link.expense_posting_id)?.amount ?? "Amount unavailable"} {postingById.get(link.expense_posting_id)?.currency ?? ""}
              {link.finance_source_row_id ? " · verify current import status" : ""}
            </HistoryItem>)}</ol> : null}
          </> : <Alert tone="restricted">Repair costs are available only to finance-authorized roles.</Alert>}
        </>}
        actions={director && actions.length > 0 && postings.length > 0 ? <ActionCard title="Link approved repair expense" intro="Links an existing posted expense once. It does not create a new posting or payment.">
          {formKind(asset.id, "cost")}
          <SelectField label="Maintenance action" name="actionId">{actions.map((action) => <option key={action.id} value={action.id}>{readable(action.action_kind)} · {when(action.recorded_at)}</option>)}</SelectField>
          <SelectField label="Posted repair expense" name="postingId">{postings.map((posting) => <option key={posting.id} value={posting.id}>{posting.amount} {posting.currency} · {when(posting.posted_at)} · {siteNames.get(posting.site_id) ?? "Site"}</option>)}</SelectField>
          <TextField label="Invoice reference" name="invoiceReference" minLength={2} required />
          <TextField label="Accepted accounting source row ID, if reconciled" name="sourceRowId" />
          <Button variant="secondary" type="submit">Link cost source once</Button>
        </ActionCard> : undefined} />

      <AssetSection id="evidence" title="Private evidence"
        badge={<StatusBadge tone="neutral">{evidenceLinks.length} {evidenceLinks.length === 1 ? "link" : "links"}</StatusBadge>}
        records={<p className="panelIntro">{evidenceLinks.length} source attachment link{evidenceLinks.length === 1 ? "" : "s"}. Source media remains in its private evidence record; a correction is a new event.</p>}
        actions={canManage && evidenceRows.length > 0 && (inspections.length > 0 || actions.length > 0) ? <ActionCard title="Associate existing ready evidence" intro="Choose exactly one inspection or maintenance event.">
          {formKind(asset.id, "evidence")}
          <SelectField label="Evidence" name="evidenceId">{evidenceRows.map((entry) => <option key={entry.id} value={entry.id}>{when(entry.captured_at ?? entry.received_at)} · {entry.id.slice(0, 8)}</option>)}</SelectField>
          <SelectField label="Inspection" name="inspectionId"><option value="">None</option>{inspections.map((entry) => <option key={entry.id} value={entry.id}>{when(entry.inspected_at)}</option>)}</SelectField>
          <SelectField label="Maintenance event" name="actionId"><option value="">None</option>{actions.map((entry) => <option key={entry.id} value={entry.id}>{readable(entry.action_kind)} · {when(entry.recorded_at)}</option>)}</SelectField>
          <Button variant="secondary" type="submit">Link private evidence</Button>
        </ActionCard> : undefined} />

      <AssetSection id="history" title="Site history"
        records={siteHistory.length ? <ol className="historyList" aria-label="Site history">{siteHistory.map((entry) => <HistoryItem key={entry.id}
          meta={<><strong>{siteNames.get(entry.site_id) ?? "Historical site"}</strong><span>{when(entry.started_at)} to {entry.ended_at ? when(entry.ended_at) : "present"}</span></>}>
          {entry.reason}
        </HistoryItem>)}</ol> : <p className="panelIntro">No site movement recorded.</p>}
        actions={director && access.sites.length > 1 ? <ActionCard title="Move asset to another site" intro="The move is recorded; earlier site history is preserved.">
          {formKind(asset.id, "move")}
          <SelectField label="Destination" name="targetSiteId">{access.sites.filter((site) => site.id !== asset.site_id).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</SelectField>
          <TextField label="Movement reason" name="reason" minLength={3} required />
          <Button variant="secondary" type="submit">Move and preserve history</Button>
        </ActionCard> : undefined} />
    </div>
  </AppShell>;
}
