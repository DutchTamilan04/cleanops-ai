"use client";

import { useState, useTransition } from "react";
import { performOperationsAction, type OperationsActionState } from "@/app/operations/actions";
import type { OperationsWorkspace } from "@/integrations/operations/supabase-operations";
import { Alert, Button, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ui";

const stateLabels: Record<string, string> = { planned: "Scheduled", ready: "Ready", in_progress: "In progress", submitted: "Review due", correction_required: "Correction due", approved: "Approved", empty: "No task" };
const stateTones = {
  planned: "neutral", ready: "pending", in_progress: "info", submitted: "pending",
  correction_required: "danger", approved: "success", empty: "neutral",
} as const;

export function OperationsCommand({ workspace }: { workspace: OperationsWorkspace }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<OperationsActionState | null>(null);
  const act = (input: Parameters<typeof performOperationsAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performOperationsAction(input)));
  };
  const full = workspace.coverage.gap === 0;
  const reset = () => {
    if (window.confirm("Reset every shared synthetic workflow to its starting state?")) {
      act({ action: "reset_hosted_demo" });
    }
  };

  return (
    <div className="opsWorkspace">
      <header className="opsHeader">
        <div><p className="eyebrow">Sunday night · 22:45–06:00</p><h1>Operations command</h1><p>Staffing, task delivery and supervisor work from recorded activity at {workspace.siteName}.</p></div>
        <StatusBadge tone={full ? "success" : "pending"}>{full ? "Covered" : `${workspace.coverage.gap} position gap`}</StatusBadge>
      </header>
      {notice ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}
      {pending ? <Alert tone="pending">Saving staffing record…</Alert> : null}
      <KpiCardGrid ariaLabel="Operations summary">
        <KpiCard label="Eligible workers present" value={<>{workspace.coverage.present} / {workspace.coverage.required}</>} help="Distinct assigned check-ins" variant="hero" />
        <KpiCard label="Review queue" value={workspace.outstandingReviews} help="Submitted tasks" />
        <KpiCard label="Corrections" value={workspace.openCorrections} help="Open or resubmitted" />
        <KpiCard label="SLA risk" value={workspace.slaRisks} help="Due by 23:30, incomplete" />
      </KpiCardGrid>
      <div className="opsGrid">
        <section className="opsPanel" aria-labelledby="coverage-title">
          <div className="panelHeading"><div><p className="eyebrow">Coverage from records</p><h2 id="coverage-title">Night shift staffing</h2></div><span className="recordLabel">Live records</span></div>
          <div className="coverageTrack" role="meter" aria-valuemin={0} aria-valuemax={workspace.coverage.required} aria-valuenow={Math.min(workspace.coverage.present, workspace.coverage.required)} aria-label={`${workspace.coverage.present} of ${workspace.coverage.required} positions covered`}><span style={{ width: `${Math.min((workspace.coverage.present / workspace.coverage.required) * 100, 100)}%` }} /></div>
          <ol className="coverageTimeline">
            {workspace.timeline.map((point) => <li key={point.time}><time>{point.time}</time><span className={point.present === point.required ? "timelineDotFull" : ""} /><div><strong>{point.present}/{point.required} present</strong><StatusBadge tone={point.present === point.required ? "success" : "pending"}>{point.present === point.required ? "Coverage complete" : `${point.required - point.present} positions open`}</StatusBadge></div></li>)}
          </ol>
          <div className="replacementList">
            <h3>Eligible replacement candidates</h3>
            {workspace.candidates.map((candidate) => (
              <article key={candidate.id}>
                <div><strong>{candidate.name}</strong><StatusBadge tone={candidate.checkedIn ? "success" : candidate.selected ? "pending" : "neutral"}>{candidate.checkedIn ? "Checked in" : candidate.selected ? "Assigned · awaiting check-in" : "Eligible · available"}</StatusBadge></div>
                {!candidate.selected ? <Button variant="secondary" type="button" disabled={pending} onClick={() => act({ action: "select_replacement", workerId: candidate.id })}>Select &amp; assign</Button>
                  : !candidate.checkedIn ? <Button variant="primary" type="button" disabled={pending} onClick={() => act({ action: "check_in_replacement", workerId: candidate.id })}>Record check-in</Button>
                  : <span className="completeMark" aria-label="Complete">✓</span>}
              </article>
            ))}
          </div>
          <p className="recordNote">Candidate eligibility is a synthetic site permission reviewed by a human. CleanOps does not dispatch automatically.</p>
        </section>
        <section className="opsPanel" aria-labelledby="zones-title">
          <div className="panelHeading"><div><p className="eyebrow">Canonical task states</p><h2 id="zones-title">Site zones</h2></div><span>{workspace.zones.length} zones</span></div>
          <div className="zoneList">
            {workspace.zones.map((zone) => <article key={zone.id}><span className={`zoneSignal zoneSignal-${zone.state}`} /><div><strong>{zone.name}</strong><span>{zone.task}</span>{zone.taskRunId ? <a href={`/review?taskRunId=${zone.taskRunId}`}>Open review →</a> : null}</div><StatusBadge tone={stateTones[zone.state as keyof typeof stateTones] ?? "neutral"}>{stateLabels[zone.state] ?? zone.state.replaceAll("_", " ")}</StatusBadge></article>)}
          </div>
          <a className="mobileJourneyLink" href="/mobile"><span>Cleaner workflow</span><strong>Open mobile task capture →</strong></a>
        </section>
      </div>
      <section className="demoReset" aria-labelledby="demo-reset-title">
        <div><p className="eyebrow">Shared presentation environment</p><h2 id="demo-reset-title">Reset the walkthrough</h2><p>Clear synthetic staffing changes, evidence, reviews, incidents and released reports before the next presentation.</p></div>
        <Button variant="secondary" type="button" disabled={pending} onClick={reset}>Reset demo</Button>
      </section>
    </div>
  );
}
