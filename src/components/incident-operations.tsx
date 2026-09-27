"use client";

import { useState, useTransition } from "react";
import { performIncidentAction, type ReportingActionState } from "@/app/incidents/actions";
import type { IncidentWorkspace } from "@/integrations/reporting/supabase-reporting";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export function IncidentOperations({ workspace }: { workspace: IncidentWorkspace }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ReportingActionState | null>(null);
  const act = (input: Parameters<typeof performIncidentAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performIncidentAction(input)));
  };

  return (
    <div className="reportingWorkspace">
      <header className="reportingHeader">
        <div><p className="eyebrow">Golden demo · Sunday night</p><h1>Incident &amp; equipment desk</h1><p>Structured reports at {workspace.siteName}, preserved as reported and separated from conclusions.</p></div>
        <StatusBadge tone="neutral">Internal records</StatusBadge>
      </header>
      {notice ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}
      {pending ? <Alert tone="pending">Saving operational record…</Alert> : null}

      <div className="reportingGrid">
        <section className="reportingPanel" aria-labelledby="incident-title">
          <div className="panelHeading"><div><p className="eyebrow">00:17 · Slot Bank 14</p><h2 id="incident-title">Reported scratch</h2></div><StatusBadge tone="pending">Cause undetermined</StatusBadge></div>
          {workspace.incident ? (
            <>
              <dl className="recordFacts"><div><dt>Status</dt><dd><StatusBadge tone="pending">{workspace.incident.state}</StatusBadge></dd></div><div><dt>Attributed to</dt><dd>{workspace.incident.worker}</dd></div><div><dt>Zone</dt><dd>{workspace.incident.zone}</dd></div></dl>
              <Alert tone="info" className="recordSummary"><span>Recorded summary</span><strong>{workspace.incident.summary}</strong></Alert>
              <blockquote className="statementCard"><span>Attributed statement</span><p>{workspace.incident.statement}</p></blockquote>
              <Alert tone="info" className="actionRecord"><strong>Recorded action:</strong> {workspace.incident.action}</Alert>
              {!workspace.incident.corrected ? <Button type="button" disabled={pending} onClick={() => act({ action: "correct_incident", incidentId: workspace.incident!.id })}>Clarify wording &amp; audit</Button> : <Alert tone="info">Wording correction audited. Cause remains undetermined.</Alert>}
              <ol className="incidentTimeline" aria-label="Incident timeline">{workspace.incident.timeline.map((event) => <li key={event.id}><time><StatusBadge tone="neutral">{event.time}</StatusBadge></time><span aria-hidden="true" /><p>{event.description}</p></li>)}</ol>
            </>
          ) : (
            <Alert tone="info" className="reportingEmpty"><p>No incident has been recorded for the 00:17 event.</p><Button variant="primary" type="button" disabled={pending} onClick={() => act({ action: "record_incident" })}>Record reported incident</Button></Alert>
          )}
        </section>

        <section className="reportingPanel" aria-labelledby="equipment-title">
          <div className="panelHeading"><div><p className="eyebrow">02:05 · operator report</p><h2 id="equipment-title">Equipment intake</h2></div><StatusBadge tone="pending">Report only</StatusBadge></div>
          {workspace.equipment ? (
            <>
              <div className="equipmentState"><span>Current state</span><StatusBadge tone="pending">{workspace.equipment.state}</StatusBadge></div>
              <h3>{workspace.equipment.label}</h3><Alert tone="pending" className="equipmentIssue">{workspace.equipment.issue}</Alert>
              <dl className="recordFacts"><div><dt>Reported by</dt><dd>{workspace.equipment.worker}</dd></div><div><dt>Zone</dt><dd>{workspace.equipment.zone}</dd></div><div><dt>Maintenance ref.</dt><dd>{workspace.equipment.maintenanceReference ?? "None"}</dd></div></dl>
              <Alert tone="pending" className="boundaryCallout"><strong>No completed repair claimed</strong><p>This intake stays <em>reported</em> until a real maintenance workflow records a later state.</p></Alert>
            </>
          ) : (
            <Alert tone="info" className="reportingEmpty"><p>No equipment issue has been recorded for the 02:05 event.</p><Button variant="primary" type="button" disabled={pending} onClick={() => act({ action: "record_equipment" })}>Record scrubber report</Button></Alert>
          )}
        </section>
      </div>
      <a className="nextJourneyLink" href="/reports"><span>Shift close</span><strong>Prepare client report →</strong></a>
    </div>
  );
}
