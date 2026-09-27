import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, KpiCard, KpiCardGrid, SelectField, StatusBadge, TextField } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { getContractDetail } from "@/integrations/finance/supabase-contracts";
import { createManualContract, removeContractDraftItem, saveContractStep } from "../actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sectionNames = ["Identity", "Dates", "Billing terms", "Staffing", "Recurring work",
  "Specialist work", "SLA and reporting", "Responsibilities", "Final review"];
const responsibilityOptions = ["unknown", "included", "reimbursable", "client_provided", "mixed"];

export default async function NewContractPage({ searchParams }: {
  searchParams: Promise<{ draftId?: string; step?: string; error?: string }>;
}) {
  const params = await searchParams;
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const canDraft = ["organization_administrator", "area_manager"].includes(access.role);
  const step = params.draftId ? Math.max(1, Math.min(8, Number(params.step) || 2)) : 1;
  const detail = canDraft && params.draftId ? await getContractDetail(client, access, params.draftId) : null;
  const draft = detail?.version.state === "draft" ? detail : null;
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <section className="accessState contractEditor">
      <p className="eyebrow">Finance / contracts / manual setup</p>
      <h1>{draft ? `${draft.contract.code} · ${sectionNames[step - 1]}` : "New manual contract"}</h1>
      {draft && <StatusBadge tone="pending">Draft · step {step} of 8</StatusBadge>}
      {!canDraft ? <Alert tone="restricted">Draft access is restricted.</Alert> : <p>Save each section before continuing. Drafts remain available in the contract register.</p>}
      {params.error && <Alert tone="danger">{params.error}</Alert>}
      {canDraft && !draft && <form className="contractForm" action={createManualContract}>
        <SelectField label="Casino" name="siteId" required>{access.sites.map((site) =>
          <option key={site.id} value={site.id}>{site.name}</option>)}</SelectField>
        <TextField label="Contract code" name="code" required minLength={2} maxLength={80} />
        <TextField label="Contract name" name="name" required minLength={2} maxLength={160} />
        <Button variant="primary" type="submit">Create draft and continue</Button>
      </form>}
      {draft && <>
        <KpiCardGrid ariaLabel="Saved contract draft items"><KpiCard label="Commercial terms" value={draft.terms.length}/><KpiCard label="Staffing rules" value={draft.staffing.length}/><KpiCard label="Service obligations" value={draft.obligations.length}/><KpiCard label="SLA definitions" value={draft.sla.length}/></KpiCardGrid>
        <nav className="contractSteps" aria-label="Contract sections"><ol>{sectionNames.slice(0,8).map((name, index) =>
          <li key={name}><Link aria-current={index + 1 === step ? "step" : undefined} href={`/finance/contracts/new?draftId=${draft.contract.id}&step=${index + 1}`}>{name}</Link></li>)}</ol></nav>
        <form className="contractForm" action={saveContractStep}>
          <input type="hidden" name="contractId" value={draft.contract.id} />
          <input type="hidden" name="step" value={step} />
          {step === 1 && <>
            <p>Casino: {draft.contract.siteName}. Create a separate draft for another casino.</p>
            <TextField label="Contract code" name="code" required minLength={2} maxLength={80} defaultValue={draft.contract.code} />
            <TextField label="Contract name" name="name" required minLength={2} maxLength={160} defaultValue={draft.contract.name} />
          </>}
          {step === 2 && <>
            <TextField label="Effective from" type="date" name="effectiveFrom" required defaultValue={draft.version.effective_from ?? ""} />
            <TextField label="Expires before" type="date" name="effectiveTo" defaultValue={draft.version.effective_to ?? ""} />
            <label>Renewal notes <textarea name="renewalNotes" defaultValue={draft.version.renewal_notes ?? ""} /></label>
            <label>Reference notes <textarea name="referenceNotes" defaultValue={draft.version.reference_notes ?? ""} /></label>
          </>}
          {step === 3 && <>
            <p>Saved terms: {draft.terms.length}. Add each commercial term separately.</p>
            <SelectField label="Billing model" name="basis">{["fixed_monthly", "fixed_annual", "hourly", "per_shift", "project_fixed", "custom"].map((basis) =>
              <option key={basis} value={basis}>{basis.replaceAll("_", " ")}</option>)}</SelectField>
            <TextField label="Amount" name="amount" type="number" min="0" step="0.01" />
            <TextField label="Currency" name="currency" defaultValue="CAD" maxLength={3} />
            <TextField label="Effective from" name="effectiveFrom" type="date" required defaultValue={draft.version.effective_from ?? ""} />
            <TextField label="Expires before" name="effectiveTo" type="date" />
            <label>Notes <textarea name="description" /></label>
          </>}
          {step === 4 && <>
            <p>Saved staffing rules: {draft.staffing.length}.</p>
            <SelectField label="Weekday" name="weekday">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) =>
              <option key={day} value={index}>{day}</option>)}</SelectField>
            <TextField label="Start" type="time" name="localStart" required />
            <TextField label="End" type="time" name="localEnd" required />
            <TextField label="Required positions" type="number" name="requiredPositions" min={1} defaultValue={1} required />
          </>}
          {(step === 5 || step === 6) && <>
            <p>Saved {step === 6 ? "specialist" : "routine"} obligations: {draft.obligations.filter((item) => item.work_type === (step === 6 ? "specialist" : "routine")).length}. Add each task separately.</p>
            <SelectField label="Zone" name="zoneId" required>{draft.zones.map((zone) =>
              <option key={zone.id} value={zone.id}>{zone.name}</option>)}</SelectField>
            <TextField label="Service task" name="name" required minLength={2} />
            <SelectField label="Frequency" name="recurrence">{(step === 6 ? ["monthly", "quarterly", "annual"] : ["daily", "weekly", "monthly", "quarterly", "annual"]).map((frequency) =>
              <option key={frequency} value={frequency}>{frequency}</option>)}</SelectField>
            <TextField label="Due window in minutes" name="dueWindowMinutes" type="number" min={1} defaultValue={1440} required />
            <label><input type="checkbox" name="evidenceRequired" defaultChecked /> Evidence required</label>
            <label><input type="checkbox" name="inspectionRequired" /> Inspection required</label>
          </>}
          {step === 7 && <>
            <p>Saved SLA definitions: {draft.sla.length}. Leave this section empty when the contract has no known SLA.</p>
            <TextField label="SLA name" name="name" required minLength={2} />
            <TextField label="Numerator rule" name="numeratorRule" required minLength={2} />
            <TextField label="Denominator rule" name="denominatorRule" required minLength={2} />
            <TextField label="Exclusion rule" name="exclusionRule" required minLength={2} />
          </>}
          {step === 8 && <>
            {(["supply", "equipment", "repair"] as const).map((field) =>
              <SelectField key={field} label={`${field} responsibility`} name={field} defaultValue={draft.version[`${field}_responsibility`]}>
                {responsibilityOptions.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
              </SelectField>)}
          </>}
          <Button variant="primary" type="submit">Save {sectionNames[step - 1].toLowerCase()}</Button>
        </form>
        {step >= 3 && step <= 7 && <ul>{(
          step === 3 ? draft.terms.map((item) => ({ id: item.id, kind: "term", label: `${item.basis}: ${item.amount ?? "unpriced"} ${item.currency ?? ""}` }))
          : step === 4 ? draft.staffing.map((item) => ({ id: item.id, kind: "staffing", label: `Weekday ${item.weekday} · ${item.local_start}–${item.local_end} · ${item.required_positions} positions` }))
          : step === 7 ? draft.sla.map((item) => ({ id: item.id, kind: "sla", label: item.name }))
          : draft.obligations.filter((item) => item.work_type === (step === 6 ? "specialist" : "routine"))
            .map((item) => ({ id: item.id, kind: "obligation", label: `${item.name} · ${item.recurrence}` }))
        ).map((item) => <li key={item.id}>{item.label}
          <form action={removeContractDraftItem}>
            <input type="hidden" name="contractId" value={draft.contract.id} />
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="kind" value={item.kind} />
            <input type="hidden" name="step" value={step} />
            <Button variant="danger" type="submit" aria-label={`Remove ${item.label}`}>Remove</Button>
          </form>
        </li>)}</ul>}
        {step < 8 && <p><Link href={`/finance/contracts/new?draftId=${draft.contract.id}&step=${step + 1}`}>Continue to {sectionNames[step].toLowerCase()}</Link></p>}
        <p><Link href={`/finance/contracts/${draft.contract.id}/review`}>Review saved draft</Link></p>
      </>}
      <p><Link href="/finance/contracts">Back to contract register</Link></p>
    </section>
  </AppShell>;
}
