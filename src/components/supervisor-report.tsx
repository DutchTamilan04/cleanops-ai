"use client";

import { useState, useTransition } from "react";
import { performReportAction, type ReportActionState } from "@/app/reports/actions";
import type { SupervisorReportWorkspace } from "@/integrations/reporting/supabase-reporting";
import { Alert, Button, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ui";

export function SupervisorReport({ workspace }: { workspace: SupervisorReportWorkspace }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ReportActionState | null>(null);
  const act = (input: Parameters<typeof performReportAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performReportAction(input)));
  };
  const report = workspace.report;
  return (
    <div className="reportingWorkspace">
      <header className="reportingHeader"><div><p className="eyebrow">06:00 · supervisor close</p><h1>Client report release</h1><p>Supervisor workspace: prepare, review and release a redacted service record for {workspace.clientName}.</p></div><StatusBadge tone={report?.state === "released" ? "success" : "pending"}>{report?.state === "released" ? "Released" : "Internal draft"}</StatusBadge></header>
      {notice ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}
      {pending ? <Alert tone="info">Calculating and saving report…</Alert> : null}

      <section className="metricDefinition" aria-labelledby="sla-definition-title">
        <div><p className="eyebrow">Versioned definition · v{workspace.definition.version}</p><h2 id="sla-definition-title">{workspace.definition.name}</h2></div>
        <dl><div><dt>Numerator</dt><dd>{workspace.definition.numerator_rule}</dd></div><div><dt>Denominator</dt><dd>{workspace.definition.denominator_rule}</dd></div><div><dt>Exclusions</dt><dd>{workspace.definition.exclusion_rule}</dd></div></dl>
      </section>

      {report ? (
        <>
          <KpiCardGrid ariaLabel="Computed report metrics">
            <KpiCard variant="hero" label="SLA completion" value={report.completion_rate === null ? "N/A" : `${report.completion_rate.toFixed(1)}%`} help={`${report.approved_on_time_runs} approved on time / ${report.due_required_runs} due required runs`} />
            <KpiCard label="Exclusions" value={report.excluded_runs} help="Recorded contractual exclusions" />
            <KpiCard label="Incidents" value={report.incident_count} help="Documented, client-redacted" />
            <KpiCard label="Equipment" value={report.equipment_report_count} help="Reported issues" />
          </KpiCardGrid>
          <div className="reportingGrid">
            <section className="reportingPanel"><p className="eyebrow">Released wording preview</p><h2>Operations summary</h2><p>{report.incident_summary}</p><p>{report.equipment_summary}</p></section>
            <section className="reportingPanel"><p className="eyebrow">Safety metric</p><h2>N/A</h2><p>{report.safety_explanation}</p><Alert tone="pending"><strong>No “zero overdue” claim</strong><p>Safety schedules and check records are outside this phase.</p></Alert></section>
          </div>
          <div className={`releasePanel ${report.state === "released" ? "releasePanel-released" : "releasePanel-draft"}`}><Alert tone={report.state === "released" ? "success" : "pending"}><strong>{report.state === "released" ? "Client access enabled" : "Client access is still closed"}</strong><p>{report.state === "released" ? "Only this redacted snapshot is available to site-authorized client viewers." : "Review the snapshot, then release it deliberately."}</p></Alert>{report.state === "draft" ? <Button variant="primary" type="button" disabled={pending} onClick={() => act({ action: "release_report", reportId: report.id })}>Release report to client</Button> : <a className="ui-button ui-button-secondary" href="/reports/client">Open client view</a>}</div>
        </>
      ) : (
        <section className="reportingEmpty reportPrepare"><h2>No report prepared</h2><p>The 150 task-result fixture is ready. Preparing computes and stores the metric once without releasing it.</p><Button variant="primary" type="button" disabled={pending} onClick={() => act({ action: "prepare_report" })}>Prepare computed report</Button></section>
      )}
      {workspace.audit.length ? <section className="auditStrip" aria-label="Release audit"><h2>Release audit</h2>{workspace.audit.map((event) => <p key={event.id}><strong>{event.action}</strong><span>{event.reason}</span></p>)}</section> : null}
    </div>
  );
}
