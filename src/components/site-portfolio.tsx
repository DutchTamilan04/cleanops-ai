import Link from "next/link";
import type { ReactNode } from "react";
import type { SitePortfolio as SitePortfolioData } from "@/integrations/operations/supabase-site-portfolio";
import { StatusBadge } from "@/components/ui";
import { assetConditionLabel, assetStatusLabel, readable } from "@/config/equipment-labels";

// #188: Operations "Command deck" (design board Round 4, direction A). Presentation only: every figure
// comes from the site portfolio the page already loads.

type Site = SitePortfolioData["sites"][number];
type Asset = Site["equipment"][number];
type Tone = "success" | "pending" | "danger" | "neutral";

const DAY = 24 * 60 * 60 * 1000;
const CLOSED_REPORTS = new Set(["resolved", "closed", "returned_to_service"]);
const READINESS = [
  { state: "available", label: "Available" },
  { state: "in_use", label: "In use" },
  { state: "maintenance", label: "In maintenance" },
  { state: "out_of_service", label: "Out of service" },
] as const;
const TONE_COLOR: Record<Tone, string> = {
  success: "var(--status-success-fg)",
  pending: "var(--prototype-dot)",
  danger: "var(--status-danger-border)",
  neutral: "var(--planned-border)",
};

/** Today's date for service due-dates; kept out of render so the component stays pure. */
function serviceClock(now = new Date()) {
  return { todayMs: Date.parse(now.toISOString().slice(0, 10)) };
}
type Clock = ReturnType<typeof serviceClock>;

const prettyDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const daysUntil = (date: string, clock: Clock) => Math.round((Date.parse(date) - clock.todayMs) / DAY);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ready = (site: Site) => site.equipment.filter((a) => a.state === "available" || a.state === "in_use").length;
const openReports = (site: Site) => site.equipmentReports.filter((r) => !CLOSED_REPORTS.has(r.state));

function serviceDue(date: string | null, clock: Clock): { label: string; tone?: Tone } {
  if (!date) return { label: "No service scheduled" };
  const days = daysUntil(date, clock);
  if (days < 0) return { label: `Service overdue by ${plural(-days, "day")}`, tone: "danger" };
  if (days === 0) return { label: "Service due today", tone: "pending" };
  if (days <= 30) return { label: `Service due in ${plural(days, "day")}`, tone: "pending" };
  return { label: `Next service ${prettyDate(date)}` };
}

function siteHealth(site: Site): { label: string; tone: Tone } {
  const out = site.equipment.filter((a) => a.state === "out_of_service").length;
  const attention = site.equipment.filter((a) => a.state === "maintenance").length + openReports(site).length;
  if (out) return { label: `${out} out of service`, tone: "danger" };
  if (attention) return { label: `${attention} ${attention === 1 ? "item needs" : "items need"} attention`, tone: "pending" };
  if (!site.equipment.length) return { label: "No equipment recorded", tone: "neutral" };
  return { label: "All equipment ready", tone: "success" };
}

/** The single most urgent equipment action for a casino, if any. */
function nextAction(site: Site, clock: Clock): { title: string; detail: string; tone: Tone; href: string } | null {
  const find = (state: string) => site.equipment.find((a) => a.state === state);
  const out = find("out_of_service");
  if (out) return { title: out.type, detail: "Out of service", tone: "danger", href: `/equipment/${out.id}` };
  const maintenance = find("maintenance");
  if (maintenance) return { title: maintenance.type, detail: "In maintenance", tone: "pending", href: `/equipment/${maintenance.id}` };
  const scheduled = site.equipment.filter((a): a is Asset & { nextServiceAt: string } => Boolean(a.nextServiceAt))
    .sort((a, b) => a.nextServiceAt.localeCompare(b.nextServiceAt))[0];
  if (scheduled && daysUntil(scheduled.nextServiceAt, clock) <= 30) {
    const due = serviceDue(scheduled.nextServiceAt, clock);
    return { title: scheduled.type, detail: due.label, tone: due.tone ?? "pending", href: `/equipment/${scheduled.id}` };
  }
  const report = openReports(site)[0];
  if (report) return { title: report.label, detail: `Issue ${readable(report.state).toLowerCase()}`, tone: "pending", href: "/equipment" };
  if (scheduled) return { title: scheduled.type, detail: `Next service ${prettyDate(scheduled.nextServiceAt)}`, tone: "success", href: `/equipment/${scheduled.id}` };
  return null;
}

function Ring({ value, total, size, stroke, color, track, caption, label }: {
  value: number; total: number; size: number; stroke: number; color: string; track: string; caption: string; label: string;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = total ? value / total : 0;
  return (
    <div className="deckRing" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${circumference * share} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="deckRing-value" aria-hidden="true">
        <strong>{total ? `${Math.round(share * 100)}%` : "—"}</strong>
        <small>{caption}</small>
      </span>
    </div>
  );
}

function ReadinessBar({ site }: { site: Site }) {
  const total = site.equipment.length;
  const counts = READINESS.map((entry) => ({ ...entry, count: site.equipment.filter((a) => a.state === entry.state).length }));
  const other = total - counts.reduce((sum, entry) => sum + entry.count, 0);
  const parts = [...counts, { state: "other", label: "Other", count: other }].filter((entry) => entry.count > 0);
  return (
    <div className="readiness">
      <div className="readiness-bar" role="img" aria-label={`Equipment readiness: ${parts.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(", ")}`}>
        {parts.map((p) => <span key={p.state} className={`readiness-segment readiness-${p.state}`} style={{ flexGrow: p.count }} />)}
      </div>
      <ul className="readiness-legend" aria-hidden="true">
        {parts.map((p) => <li key={p.state}><span className={`readiness-dot readiness-${p.state}`} />{p.count} {p.label.toLowerCase()}</li>)}
      </ul>
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return <div className="deckStat"><dt>{label}</dt><dd>{value}</dd></div>;
}

function CasinoCard({ site, clock }: { site: Site; clock: Clock }) {
  const health = siteHealth(site);
  const reports = openReports(site);
  const action = nextAction(site, clock);
  const readyCount = ready(site);
  return (
    <article className="deckCard" aria-labelledby={`casino-${site.id}`}>
      <header className="deckCard-head">
        <Ring value={readyCount} total={site.equipment.length} size={92} stroke={10} color={TONE_COLOR[health.tone]}
          track="var(--v2-surface-muted)" caption="ready" label={`${readyCount} of ${site.equipment.length} machines ready`} />
        <div className="deckCard-title">
          <p className="eyebrow">{site.city ?? "British Columbia"}</p>
          <h2 id={`casino-${site.id}`}>{site.name}</h2>
          <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
        </div>
      </header>

      <dl className="deckStats">
        <Stat value={site.zones.length} label="Areas" />
        <Stat value={site.activeTasks} label="Active tasks" />
        <Stat value={site.workers} label="Eligible workers" />
        <Stat value={reports.length} label="Open issues" />
      </dl>

      {site.equipment.length ? <ReadinessBar site={site} /> : null}

      {action ? (
        <Link href={action.href} className={`deckAction deckAction-${action.tone}`}>
          <span className="deckAction-text"><span className="deckAction-kicker">Next up</span><strong>{action.title}</strong><span>{action.detail}</span></span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : <p className="deckEmpty">No equipment actions due.</p>}

      {site.zones.length ? (
        <ul className="casinoAreas" aria-label={`Areas at ${site.name}`}>
          {site.zones.map((zone) => <li key={zone.id}>{zone.name}</li>)}
        </ul>
      ) : null}

      <details className="deckRegister">
        <summary><span>Equipment register</span><span className="deckRegister-count">{plural(site.equipment.length, "asset")} · {site.taskRuns} task records</span></summary>
        {site.equipment.length ? (
          <ul className="assetRows">
            {site.equipment.map((asset) => {
              const status = assetStatusLabel(asset.state);
              const due = serviceDue(asset.nextServiceAt, clock);
              return (
                <li key={asset.id} className="assetRow">
                  <div className="assetRow-main">
                    <strong>{asset.type}</strong>
                    <span><Link href={`/equipment/${asset.id}`}>{asset.assetTag}</Link>{asset.model ? ` · ${[asset.manufacturer, asset.model].filter(Boolean).join(" ")}` : ""}</span>
                  </div>
                  <div className="assetRow-meta">
                    <span className={due.tone ? `assetRow-due assetRow-due-${due.tone}` : "assetRow-due"}>{due.label}</span>
                    <span>Condition: {assetConditionLabel(asset.condition).label}</span>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </li>
              );
            })}
          </ul>
        ) : <p className="deckEmpty">No equipment assets recorded.</p>}
        {reports.length ? (
          <ul className="casinoIssues" aria-label={`Open equipment issues at ${site.name}`}>
            {reports.map((report) => <li key={report.id}><span>{report.label}</span><StatusBadge tone="pending">{readable(report.state)}</StatusBadge></li>)}
          </ul>
        ) : null}
      </details>
    </article>
  );
}

export function SitePortfolio({ portfolio }: { portfolio: SitePortfolioData }) {
  const clock = serviceClock();
  const sites = portfolio.sites;
  const sum = (pick: (site: Site) => number) => sites.reduce((total, site) => total + pick(site), 0);
  const equipment = sum((site) => site.equipment.length);
  const readyTotal = sum(ready);
  const needing = sites.filter((site) => ["pending", "danger"].includes(siteHealth(site).tone)).length;
  const headline = !sites.length ? "No casinos are assigned to this account yet."
    : needing === 0 ? `All ${plural(sites.length, "casino")} have their equipment ready.`
      : `${needing} of ${plural(sites.length, "casino")} ${needing === 1 ? "needs" : "need"} equipment attention.`;
  const figures = [
    { value: equipment ? `${readyTotal}/${equipment}` : "—", label: "Equipment ready" },
    { value: sum((site) => site.workers), label: "Eligible workers" },
    { value: sum((site) => site.zones.length), label: "Areas covered" },
    { value: sum((site) => openReports(site).length), label: "Open equipment issues" },
  ];
  return (
    <section className="sitePortfolio" aria-labelledby="site-portfolio-title">
      <p className="eyebrow">Operations · casino portfolio</p>
      <div className="deckBand">
        <div className="deckBand-lead">
          <Ring value={readyTotal} total={equipment} size={124} stroke={12} color="var(--status-success-bg)"
            track="rgb(255 255 255 / 14%)" caption="fleet ready" label={`${readyTotal} of ${equipment} machines ready across all casinos`} />
          <div>
            <h1 id="site-portfolio-title">Assigned casinos</h1>
            <p>{headline}</p>
          </div>
        </div>
        <dl className="deckBand-figures">
          {figures.map((figure) => <div key={figure.label}><dt>{figure.label}</dt><dd>{figure.value}</dd></div>)}
        </dl>
      </div>
      {sites.length ? <div className="casinoGrid">{sites.map((site) => <CasinoCard key={site.id} site={site} clock={clock} />)}</div> : null}
    </section>
  );
}
