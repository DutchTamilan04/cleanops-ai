import Link from "next/link";
import type { ReactNode } from "react";
import type { SitePortfolio as SitePortfolioData } from "@/integrations/operations/supabase-site-portfolio";
import { KpiCard, KpiCardGrid, StatusBadge } from "@/components/ui";
import { assetConditionLabel, assetStatusLabel, readable } from "@/config/equipment-labels";

type Site = SitePortfolioData["sites"][number];
type Tone = "success" | "pending" | "danger" | "neutral" | "info";

const DAY = 24 * 60 * 60 * 1000;
const CLOSED_REPORTS = new Set(["resolved", "closed", "returned_to_service"]);
const READINESS = [
  { state: "available", label: "Available" },
  { state: "in_use", label: "In use" },
  { state: "maintenance", label: "In maintenance" },
  { state: "out_of_service", label: "Out of service" },
] as const;

/** Today's date for service due-dates; kept out of render so the component stays pure. */
function serviceClock(now = new Date()) {
  return { today: now.toISOString().slice(0, 10), todayMs: Date.parse(now.toISOString().slice(0, 10)) };
}

function serviceDue(date: string | null, clock: ReturnType<typeof serviceClock>): { label: string; tone?: Tone } {
  if (!date) return { label: "No service scheduled" };
  const days = Math.round((Date.parse(date) - clock.todayMs) / DAY);
  if (days < 0) return { label: `Service overdue by ${-days} ${-days === 1 ? "day" : "days"}`, tone: "danger" };
  if (days === 0) return { label: "Service due today", tone: "pending" };
  if (days <= 30) return { label: `Service due in ${days} ${days === 1 ? "day" : "days"}`, tone: "pending" };
  const pretty = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return { label: `Next service ${pretty}` };
}

function siteHealth(site: Site): { label: string; tone: Tone } {
  const out = site.equipment.filter((asset) => asset.state === "out_of_service").length;
  const attention = site.equipment.filter((asset) => asset.state === "maintenance").length
    + site.equipmentReports.filter((report) => !CLOSED_REPORTS.has(report.state)).length;
  if (out) return { label: `${out} out of service`, tone: "danger" };
  if (attention) return { label: `${attention} ${attention === 1 ? "item needs" : "items need"} attention`, tone: "pending" };
  if (!site.equipment.length) return { label: "No equipment recorded", tone: "neutral" };
  return { label: "All equipment ready", tone: "success" };
}

function StatIcon({ name }: { name: "areas" | "tasks" | "records" | "workers" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="casinoStat-icon" {...common}>
      {name === "areas" && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.4" /></>}
      {name === "tasks" && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12l2 2 4-4M9 17h6" /></>}
      {name === "records" && <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20" /></>}
      {name === "workers" && <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.9.6 3 2.4 3 5.2" /></>}
    </svg>
  );
}

function Stat({ icon, label, value }: { icon: Parameters<typeof StatIcon>[0]["name"]; label: string; value: ReactNode }) {
  return <div className="casinoStat"><StatIcon name={icon} /><dt>{label}</dt><dd>{value}</dd></div>;
}

function ReadinessBar({ site }: { site: Site }) {
  const total = site.equipment.length;
  const counts = READINESS.map((entry) => ({ ...entry, count: site.equipment.filter((asset) => asset.state === entry.state).length }));
  const other = total - counts.reduce((sum, entry) => sum + entry.count, 0);
  const parts = [...counts, { state: "other", label: "Other", count: other }].filter((entry) => entry.count > 0);
  const summary = parts.map((entry) => `${entry.count} ${entry.label.toLowerCase()}`).join(", ");
  return (
    <div className="readiness">
      <div className="readiness-bar" role="img" aria-label={`Equipment readiness: ${summary}`}>
        {parts.map((entry) => <span key={entry.state} className={`readiness-segment readiness-${entry.state}`} style={{ flexGrow: entry.count }} />)}
      </div>
      <ul className="readiness-legend" aria-hidden="true">
        {parts.map((entry) => <li key={entry.state}><span className={`readiness-dot readiness-${entry.state}`} />{entry.count} {entry.label.toLowerCase()}</li>)}
      </ul>
    </div>
  );
}

function CasinoCard({ site, clock }: { site: Site; clock: ReturnType<typeof serviceClock> }) {
  const health = siteHealth(site);
  const openReports = site.equipmentReports.filter((report) => !CLOSED_REPORTS.has(report.state));
  return (
    <article className="casinoCard" aria-labelledby={`casino-${site.id}`}>
      <header className="casinoCard-head">
        <div>
          <p className="eyebrow">{site.city ?? "British Columbia"}</p>
          <h2 id={`casino-${site.id}`}>{site.name}</h2>
        </div>
        <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
      </header>

      <dl className="casinoStats">
        <Stat icon="areas" label="Areas" value={site.zones.length} />
        <Stat icon="tasks" label="Active tasks" value={site.activeTasks} />
        <Stat icon="records" label="Task records" value={site.taskRuns} />
        <Stat icon="workers" label="Eligible workers" value={site.workers} />
      </dl>

      {site.zones.length ? (
        <ul className="casinoAreas" aria-label={`Areas at ${site.name}`}>
          {site.zones.map((zone) => <li key={zone.id}>{zone.name}</li>)}
        </ul>
      ) : <p className="casinoEmpty">No areas recorded yet.</p>}

      <section className="casinoEquipment" aria-labelledby={`casino-${site.id}-equipment`}>
        <div className="casinoEquipment-head">
          <h3 id={`casino-${site.id}-equipment`}>Equipment register</h3>
          <span>{site.equipment.length} {site.equipment.length === 1 ? "asset" : "assets"} · {openReports.length} open {openReports.length === 1 ? "issue" : "issues"}</span>
        </div>
        {site.equipment.length ? (
          <>
            <ReadinessBar site={site} />
            <ul className="assetRows">
              {site.equipment.map((asset) => {
                const status = assetStatusLabel(asset.state);
                const due = serviceDue(asset.nextServiceAt, clock);
                return (
                  <li key={asset.id} className="assetRow">
                    <div className="assetRow-main">
                      <strong>{asset.type}</strong>
                      <span><Link href={`/equipment/${asset.id}`}>{asset.assetTag}</Link>{asset.model ? ` · ${asset.manufacturer ?? ""} ${asset.model}`.replace("  ", " ") : ""}</span>
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
          </>
        ) : <p className="casinoEmpty">No equipment assets recorded.</p>}
        {openReports.length ? (
          <ul className="casinoIssues" aria-label={`Open equipment issues at ${site.name}`}>
            {openReports.map((report) => <li key={report.id}><span>{report.label}</span><StatusBadge tone="pending">{readable(report.state)}</StatusBadge></li>)}
          </ul>
        ) : null}
      </section>

      <footer className="casinoCard-foot">
        <Link href="/equipment">Open equipment care <span aria-hidden="true">→</span></Link>
      </footer>
    </article>
  );
}

export function SitePortfolio({ portfolio }: { portfolio: SitePortfolioData }) {
  const clock = serviceClock();
  const sites = portfolio.sites;
  const sum = (pick: (site: Site) => number) => sites.reduce((total, site) => total + pick(site), 0);
  const equipmentCount = sum((site) => site.equipment.length);
  const attention = sum((site) => site.equipment.filter((asset) => asset.state === "maintenance" || asset.state === "out_of_service").length);
  const cities = [...new Set(sites.map((site) => site.city).filter(Boolean))];
  return (
    <section className="sitePortfolio" aria-labelledby="site-portfolio-title">
      <header className="financeHeader">
        <div>
          <p className="eyebrow">Casino portfolio</p>
          <h1 id="site-portfolio-title">Assigned casinos</h1>
          <p>Every casino and equipment record available to this account. All operational content is synthetic demo data.</p>
        </div>
      </header>
      <KpiCardGrid>
        <KpiCard variant="hero" label="Casinos" value={sites.length} help={cities.length ? cities.join(" · ") : "Assigned to this account"} />
        <KpiCard label="Areas" value={sum((site) => site.zones.length)} help="Zones across all casinos" />
        <KpiCard label="Eligible workers" value={sum((site) => site.workers)} help="With an active site grant" />
        <KpiCard label="Equipment assets" value={equipmentCount} help={!equipmentCount ? "None recorded yet" : attention ? `${attention} in maintenance or out of service` : "All ready for use"} />
      </KpiCardGrid>
      {sites.length ? (
        <div className="casinoGrid">{sites.map((site) => <CasinoCard key={site.id} site={site} clock={clock} />)}</div>
      ) : <p className="casinoEmpty">No casinos are assigned to this account yet.</p>}
    </section>
  );
}
