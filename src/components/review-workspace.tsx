"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
import type { ReviewWorkspace as ReviewWorkspaceData } from "@/integrations/review/supabase-review";
import { performReviewAction, type ReviewActionState } from "@/app/review/actions";
import { Alert, Button, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ui";

const auditLabels: Record<string, string> = {
  "quality.recorded": "Mock assessment recorded",
  "quality.failed": "Mock assessment unavailable",
  "finding.confirmed": "Supervisor confirmed finding",
  "suggestion.dismissed": "Supervisor dismissed suggestion",
  "correction.submitted": "Corrected evidence submitted",
  "submission.approved": "Supervisor approved submission",
};

function ActionButton({
  children,
  tone = "primary",
  disabled,
  onClick,
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "quiet";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant={tone === "primary" ? "navy" : tone === "quiet" ? "ghost" : "secondary"} type="button" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

function EvidenceCard({ role, evidence }: {
  role: "Before" | "After";
  evidence: ReviewWorkspaceData["evidence"]["before"];
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "missing" | "unavailable">("loading");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!evidence) return;
    let cancelled = false;
    const timer = window.setTimeout(() => setRefresh((value) => value + 1), 50_000);
    fetch(`/api/evidence/${evidence.id}/signed-url`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return { status: response.status, url: null };
        const body: unknown = await response.json();
        const url = typeof body === "object" && body !== null && "signedUrl" in body
          && typeof body.signedUrl === "string" ? body.signedUrl : null;
        return { status: response.status, url };
      })
      .then(({ status, url }) => {
        if (cancelled) return;
        setSignedUrl(url);
        setState(url ? "ready" : status === 401 || status === 403 ? "denied" : status === 404 ? "missing" : "unavailable");
      })
      .catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [evidence, refresh]);
  const visibleState = evidence ? state : "missing";
  const sourceTime = evidence?.captured_at ? new Date(evidence.captured_at).toLocaleString() : "Unknown";
  return (
    <article className="evidenceCard">
      <div className={`evidencePreview evidencePreview${role}`} aria-label={`${role} private evidence`}>
        {visibleState === "ready" && signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} data-evidence-id={evidence?.id} alt={`${role} evidence for this task`} onError={() => setState("missing")} />
        ) : <span>{visibleState === "loading" ? "Loading private image…" : visibleState === "denied" ? "Access denied" : visibleState === "missing" ? "Image missing" : "Image unavailable"}</span>}
      </div>
      <div className="evidenceMeta">
        <div>
          <strong>{role}</strong>
          <span>Source time {sourceTime} · Revision {evidence?.submission_revision ?? "—"}</span>
          <span>Source time is supplied by the sender, not proof of capture time.</span>
          {evidence ? <span>Received {new Date(evidence.received_at).toLocaleString()}</span> : null}
          {evidence ? <span>Submitted by {evidence.submitted_by_user_id ? `authenticated user ${evidence.submitted_by_user_id.slice(0, 8)}` : "synthetic ingress"}</span> : null}
          {evidence?.worker_id ? <span>Attributed worker {evidence.worker_id.slice(0, 8)}</span> : null}
        </div>
        <StatusBadge tone="info">Private</StatusBadge>
      </div>
      {evidence && visibleState !== "loading" ? <Button variant="ghost" type="button" onClick={() => { setState("loading"); setRefresh((value) => value + 1); }}>Refresh image</Button> : null}
    </article>
  );
}

export function ReviewWorkspace({ workspace, demo }: { workspace: ReviewWorkspaceData; demo: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ReviewActionState | null>(null);
  const revision = workspace.task.submission_revision;
  const taskId = workspace.task.id;
  const correction = workspace.correctiveActions.at(-1) ?? null;
  const dismissed = workspace.auditEvents.some(
    (event) => event.submission_revision === revision && event.action === "suggestion.dismissed",
  );

  const act = (input: Parameters<typeof performReviewAction>[0]) => {
    setNotice(null);
    startTransition(async () => setNotice(await performReviewAction(input)));
  };

  const status = workspace.task.state === "approved"
    ? "Approved"
    : workspace.task.state === "correction_required"
      ? "Correction required"
      : workspace.pair
        ? "Pending supervisor review"
        : "Awaiting submission";

  return (
    <div className="reviewWorkspace">
      <header className="reviewHeader">
        <div>
          <p className="reviewContext">{workspace.siteName} · synthetic night shift</p>
          <h1>Evidence review</h1>
          <p className="reviewLead">Compare the latest submission, decide whether the suggested issue is real, and approve only the current revision.</p>
        </div>
        <StatusBadge tone={workspace.task.state === "approved" ? "success" : workspace.task.state === "correction_required" ? "danger" : "pending"}>{status}</StatusBadge>
      </header>

      {notice ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}
      {pending ? <Alert tone="pending">Updating the review…</Alert> : null}

      <KpiCardGrid ariaLabel="Task summary">
        <KpiCard label="Task" value={workspace.taskName} />
        <KpiCard label="Zone" value={workspace.zoneName} />
        <KpiCard label="Worker" value="Worker 182 Demo" />
        <KpiCard label="Current revision" value={revision || "—"} />
      </KpiCardGrid>

      {!workspace.pair ? (
        <section className="reviewEmpty" aria-labelledby="prepare-title">
          <div className="reviewEmptyNumber">23:15 → 23:29</div>
          <h2 id="prepare-title">Prepare the synthetic evidence pair</h2>
          <p>This creates the private BEFORE and AFTER records used by the supervisor workflow.</p>
          <ActionButton disabled={pending || !demo} onClick={() => act({ action: "prepare_initial", taskRunId: taskId })}>
            Prepare submission
          </ActionButton>
          {!demo ? <p className="manualNote">Sign in as an authorized supervisor to review live records.</p> : null}
        </section>
      ) : (
        <div className="reviewGrid">
          <div className="reviewMain">
            <section className="reviewSection" aria-labelledby="pair-title">
              <div className="sectionHeading">
                <div><p>Submission revision {revision}</p><h2 id="pair-title">Before and after</h2></div>
                <span className="sectionTime">{revision > 1 ? "23:34" : "23:29"}</span>
              </div>
              <div className="evidencePair">
                <EvidenceCard role="Before" evidence={workspace.evidence.before} />
                <EvidenceCard role="After" evidence={workspace.evidence.after} />
              </div>
            </section>

            <section className="reviewSection qualityPanel" aria-labelledby="quality-title">
              <div className="sectionHeading">
                <div><p>Decision support</p><h2 id="quality-title">Visual quality</h2></div>
                <StatusBadge tone="ai">Mock AI</StatusBadge>
              </div>

              {!workspace.decision ? (
                <div className="qualityAwaiting">
                  <p>No suggestion has been generated. The evidence remains available for manual review.</p>
                  <div className="buttonRow">
                    <ActionButton disabled={pending} onClick={() => act({ action: "run_mock", taskRunId: taskId, revision })}>Run Mock AI</ActionButton>
                    <ActionButton tone="quiet" disabled={pending} onClick={() => act({ action: "simulate_failure", taskRunId: taskId, revision })}>Simulate failure</ActionButton>
                  </div>
                </div>
              ) : workspace.decision.status === "failed" ? (
                <Alert tone="restricted" className="manualReviewBox">
                  <strong>Mock AI unavailable</strong>
                  <p>No automated finding was created. Review the pair manually and record your decision.</p>
                  <ActionButton disabled={pending} onClick={() => act({ action: "approve", taskRunId: taskId, revision, decisionId: workspace.decision?.id ?? null, reason: "Supervisor completed manual visual review after mock failure." })}>
                    Approve after manual review
                  </ActionButton>
                </Alert>
              ) : (
                <>
                  <div className="scoreRow">
                    <div className="mockScoreCard"><KpiCard label="Mock AI score" value={workspace.decision.score} help="Advisory /100" /></div>
                    <div><strong>{revision > 1 ? "Correction looks ready for review" : "Possible quality issue"}</strong><p>Advisory score only. Supervisor approval is always required.</p></div>
                  </div>

                  {workspace.decision.observations.map((observation) => (
                    <article className="suggestionCard" key={observation.criterion_id}>
                      <div className="suggestionTop"><StatusBadge tone="pending">{observation.severity} severity</StatusBadge><StatusBadge tone="ai">Suggested by Mock AI</StatusBadge></div>
                      <h3>{observation.observation}</h3>
                      {correction?.source_revision === revision ? (
                        <Alert tone="pending" className="confirmedState"><div><strong>Finding confirmed by supervisor</strong><span>{correction.instruction}</span></div></Alert>
                      ) : dismissed ? (
                        <Alert tone="info" className="dismissedState">Suggestion dismissed by supervisor · no finding created</Alert>
                      ) : (
                        <div className="buttonRow">
                          <ActionButton disabled={pending} onClick={() => act({ action: "confirm", decisionId: workspace.decision!.id, revision, criterionId: observation.criterion_id, instruction: "Re-clean the mirror and submit a corrected AFTER photo." })}>
                            Confirm and request correction
                          </ActionButton>
                          <ActionButton tone="secondary" disabled={pending} onClick={() => act({ action: "dismiss", decisionId: workspace.decision!.id, revision, criterionId: observation.criterion_id, reason: "Supervisor inspected the evidence and found no actionable streak." })}>
                            Dismiss suggestion
                          </ActionButton>
                        </div>
                      )}
                    </article>
                  ))}

                  {workspace.decision.observations.length === 0 && workspace.task.state !== "approved" ? (
                    <Alert tone="pending" className="approvalCallout">
                      <div><strong>No issue suggested</strong><span>Score {workspace.decision.score} still requires your approval.</span></div>
                      <ActionButton disabled={pending} onClick={() => act({ action: "approve", taskRunId: taskId, revision, decisionId: workspace.decision!.id, reason: null })}>Approve revision {revision}</ActionButton>
                    </Alert>
                  ) : null}

                  {dismissed && workspace.task.state === "submitted" ? (
                    <Alert tone="pending" className="approvalCallout">
                      <div><strong>Manual decision required</strong><span>The suggestion was dismissed; approve only after checking the evidence.</span></div>
                      <ActionButton disabled={pending} onClick={() => act({ action: "approve", taskRunId: taskId, revision, decisionId: workspace.decision!.id, reason: "Supervisor dismissed the mock suggestion after manual review." })}>Approve after review</ActionButton>
                    </Alert>
                  ) : null}
                </>
              )}

              {workspace.task.state === "approved" ? <Alert tone="success" className="approvedBox"><div><strong>Revision {revision} approved</strong><span>Recorded by the supervisor; this mock score did not auto-approve the task.</span></div></Alert> : null}
            </section>

            {workspace.task.state === "correction_required" && correction ? (
              <section className="correctionPanel" aria-labelledby="correction-title">
                <Alert tone="danger"><div><p>Corrective action</p><h2 id="correction-title">{correction.instruction}</h2><span>Requested against revision {correction.source_revision}</span></div></Alert>
                <a className="ui-button ui-button-navy" href={`/mobile?taskRunId=${taskId}`}>Capture corrected after photo →</a>
                {demo ? <ActionButton tone="secondary" disabled={pending} onClick={() => act({ action: "submit_correction", taskRunId: taskId })}>Use labelled synthetic sample</ActionButton> : null}
              </section>
            ) : null}
          </div>

          <aside className="auditPanel" aria-labelledby="audit-title">
            <div className="sectionHeading"><div><p>Append-only record</p><h2 id="audit-title">Review history</h2></div></div>
            <ol className="auditList">
              <li><span className="auditDot" /><div><strong>Evidence submitted</strong><time>{revision > 1 ? "23:34" : "23:29"}</time></div></li>
              {workspace.auditEvents.map((event) => (
                <li key={event.id}><span className="auditDot" /><div><strong>{auditLabels[event.action] ?? event.action}</strong><time>Revision {event.submission_revision}</time></div></li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
