"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { performProjectAction } from "@/app/finance/projects/actions";
import { Alert, Button, KpiCard, KpiCardGrid, SelectField, StatusBadge, TextField } from "@/components/ui";

export type ProjectSummary = {
  project_id: string; site_id: string; project_code: string; name: string; state: string;
  starts_on?: string | null; ends_on?: string | null;
  scope?: string; contract_id?: string | null;
  recognized_source_count?: number; unresolved_source_count?: number; incomplete_source_count?: number;
  currency: string; pricing_model: string | null; expected_revenue: number | null;
  invoiced_revenue: number; recognized_revenue: number; labour_cost: number;
  expense_cost: number; supply_cost: number; direct_cost: number;
  expected_contribution: number | null; recognized_contribution: number | null;
  recognized_margin_pct: number | null; completeness: string;
};

type Source = { id: string; project_id: string | null; label: string; amount: number; kind: "time" | "expense" | "inventory_issue" | "accounting"; href?: string };
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ProjectWorkspace({ projects, sites, contracts, sources, director }: {
  projects: ProjectSummary[]; sites: { id: string; name: string }[];
  contracts: { id: string; site_id: string; name: string }[]; sources: Source[]; director: boolean;
}) {
  const [pending, start] = useTransition();
  // The forms use client handlers, so native submission must wait for hydration.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const controlsDisabled = !hydrated || pending;
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [site, setSite] = useState("all");
  const [state, setState] = useState("all");
  const [period, setPeriod] = useState("");
  const [newSite, setNewSite] = useState(sites[0]?.id ?? "");
  const money = (value: number | null, currency: string) => value === null ? "Pending" : new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value);
  function run(input: Parameters<typeof performProjectAction>[0]) {
    start(async () => { const result = await performProjectAction(input); setNotice(result); });
  }
  return <>
    <section className="reviewCard projectPanel"><h2>Create one-off project</h2>
      <p>Operational draft; a Director approves the commercial terms before it becomes active.</p>
      <form className="projectForm" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget);
        run({ kind: "create", siteId: String(form.get("siteId")), code: String(form.get("code")), name: String(form.get("name")), scope: String(form.get("scope")),
          contractId: String(form.get("contractId") || "") || null }); }}>
        <SelectField label="Casino" name="siteId" value={newSite} onChange={event => setNewSite(event.target.value)} required>{sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
        <SelectField label="Parent contract" name="contractId"><option value="">Standalone project</option>{contracts.filter(item => item.site_id === newSite).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
        <TextField label="Project code" name="code" required maxLength={40} placeholder="HASTINGS-DEEP-CLEAN" />
        <TextField label="Name" name="name" required maxLength={160} />
        <label>Scope <textarea name="scope" required maxLength={2000} /></label>
        <Button variant="primary" disabled={controlsDisabled}>Create draft</Button>
      </form>
    </section>
    <section className="reviewCard projectPanel"><h2>Project contribution</h2>
      <p>Direct contribution uses approved operational cost. Accounting recognition is shown separately; final margin appears only after a complete import and Director cost close.</p>
      <KpiCardGrid ariaLabel="Project counts"><KpiCard label="Projects" value={projects.length}/><KpiCard label="Active" value={projects.filter(project => project.state === "active").length}/><KpiCard label="Pending contribution" value={projects.filter(project => project.recognized_contribution === null).length}/></KpiCardGrid>
      <div className="projectFilters"><SelectField label="Casino" value={site} onChange={event => setSite(event.target.value)}><option value="all">All assigned casinos</option>{sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
      <SelectField label="Status" value={state} onChange={event => setState(event.target.value)}><option value="all">All</option>{["draft","active","completed","cancelled"].map(item => <option key={item}>{item}</option>)}</SelectField>
      <TextField label="Project month" type="month" value={period} onChange={event => setPeriod(event.target.value)} /></div>
      {projects.filter(project => (site === "all" || project.site_id === site) && (state === "all" || project.state === state)
        && (!period || (!project.starts_on || project.starts_on.slice(0,7) <= period) && (!project.ends_on || project.ends_on.slice(0,7) >= period))).map(project => <article className="reviewCard projectCard" key={project.project_id}>
        <h3>{project.name} <StatusBadge tone={project.state === "active" || project.state === "completed" ? "success" : project.state === "cancelled" ? "danger" : "pending"}>{project.project_code} · {project.state}</StatusBadge></h3>
        <p>{sites.find(item => item.id === project.site_id)?.name} · {project.pricing_model ?? "Terms pending"} · <StatusBadge tone={project.completeness === "complete" ? "success" : "pending"}>{project.completeness.replaceAll("_", " ")}</StatusBadge></p>
        <p>{project.scope}</p>
        <p>Accounting sources: {project.recognized_source_count ?? 0} recognized · {project.unresolved_source_count ?? 0} unresolved · {project.incomplete_source_count ?? 0} incomplete</p>
        <KpiCardGrid ariaLabel={`${project.name} contribution`}>
          <KpiCard label="Expected revenue" value={money(project.expected_revenue, project.currency)} unavailable={project.expected_revenue === null} help={project.expected_revenue === null ? "Terms pending" : undefined}/>
          <KpiCard label="Accounting recognized" value={money(project.recognized_revenue, project.currency)}/>
          <KpiCard label="Direct cost" value={money(project.direct_cost, project.currency)}/>
          <KpiCard label="Recognized contribution" value={money(project.recognized_contribution, project.currency)} unavailable={project.recognized_contribution === null} help={project.recognized_contribution === null ? "Accounting and cost close pending" : undefined}/>
        </KpiCardGrid>
        {project.recognized_contribution === null && <Alert tone="pending">Recognized contribution remains pending until accounting and cost close are complete.</Alert>}
        <dl className="projectDetailMetrics"><dt>Invoiced</dt><dd>{money(project.invoiced_revenue, project.currency)}</dd>
          <dt>Approved labour</dt><dd>{money(project.labour_cost, project.currency)}</dd>
          <dt>Expense cost</dt><dd>{money(project.expense_cost, project.currency)}</dd>
          <dt>Issued supplies</dt><dd>{money(project.supply_cost, project.currency)}</dd>
          <dt>Expected contribution</dt><dd>{money(project.expected_contribution, project.currency)}</dd>
          <dt>Recognized margin</dt><dd>{project.recognized_margin_pct === null ? "Pending complete accounting and cost close" : `${project.recognized_margin_pct}%`}</dd></dl>
        <details><summary>Source drill-through and allocation</summary>
          <p>Link approved records from the same casino. Equipment purchases require asset review and are excluded from direct cost.</p>
          {sources.filter(source => source.project_id === project.project_id).map(source => <p key={source.id}>{source.kind}: {source.label} · {money(source.amount, project.currency)} · source {source.id} {source.href && <Link href={source.href}>Open source</Link>}</p>)}
          {director && <form className="projectForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
            run({ kind: "link", projectId: project.project_id, sourceType: String(form.get("type")) as "time" | "expense" | "inventory_issue" | "accounting", sourceId: String(form.get("source")) }); }}>
            <SelectField label="Source type" name="type" required>{["time","expense","inventory_issue","accounting"].map(type => <option key={type}>{type}</option>)}</SelectField>
            <TextField label="Source record ID" name="source" required placeholder="Source record ID" /><Button disabled={controlsDisabled}>Link source</Button>
          </form>}
        </details>
        {project.state === "draft" && <form className="projectForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
          run({ kind: "scope", projectId: project.project_id, name: String(form.get("name")), scope: String(form.get("scope")),
            contractId: String(form.get("contractId") || "") || null }); }}>
          <TextField label="Name" name="name" defaultValue={project.name} required maxLength={160} />
          <label>Scope <textarea name="scope" defaultValue={project.scope} required maxLength={2000} /></label>
          <SelectField label="Parent contract" name="contractId" defaultValue={project.contract_id ?? ""}><option value="">Standalone project</option>
            {contracts.filter(item => item.site_id === project.site_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
          <Button disabled={controlsDisabled}>Save draft scope</Button>
        </form>}
        {director && project.state === "draft" && <form className="projectForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
          run({ kind: "approve", projectId: project.project_id, model: String(form.get("model")) as "fixed" | "hourly", amount: Number(form.get("amount")) }); }}>
          <SelectField label="Pricing" name="model"><option value="fixed">Fixed quote</option><option value="hourly">Hourly billing</option></SelectField>
          <TextField label="Quote or hourly rate" name="amount" type="number" min="0" step="0.01" required /><Button variant="primary" disabled={controlsDisabled}>Approve terms and activate</Button>
        </form>}
        {director && project.state !== "draft" && project.state !== "cancelled" && <>
          <form className="projectForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
            run({ kind: "invoice", projectId: project.project_id, reference: String(form.get("reference")), date: String(form.get("date")), amount: Number(form.get("amount")) }); }}>
            <TextField label="Invoice reference" name="reference" required /><TextField label="Date" name="date" type="date" required />
            <TextField label="Amount" name="amount" type="number" min="0.01" step="0.01" required /><Button disabled={controlsDisabled}>Record invoice</Button>
          </form>
          {project.pricing_model === "hourly" && <form className="projectForm" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
            run({ kind: "billable", projectId: project.project_id, timeEntryId: String(form.get("time")), hours: Number(form.get("hours")) }); }}>
            <TextField label="Approved time ID" name="time" required /><TextField label="Billable hours" name="hours" type="number" step="0.000001" min="0.000001" required />
            <Button disabled={controlsDisabled}>Approve billable hours</Button>
          </form>}
          <Button type="button" disabled={controlsDisabled} onClick={() => run({ kind: "complete", projectId: project.project_id, complete: project.state !== "completed" })}>
            {project.state === "completed" ? "Reopen cost close" : "Mark costs complete"}</Button>
          {project.state === "active" && <Button variant="danger" type="button" disabled={controlsDisabled} onClick={() => run({ kind: "cancel", projectId: project.project_id })}>Cancel project</Button>}
        </>}
      </article>)}
      {!projects.length && <Alert tone="info">No projects yet.</Alert>}
    </section>
    {notice && <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert>}
  </>;
}
