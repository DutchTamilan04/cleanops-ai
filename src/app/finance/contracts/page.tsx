import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Alert, KpiCard, KpiCardGrid, SectionTabs, StatusBadge } from "@/components/ui";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { listContracts } from "@/integrations/finance/supabase-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const versionTone = (state: string): "success" | "pending" | "neutral" | "danger" => state === "active" ? "success" : state === "in_review" || state === "approved" ? "pending" : state === "cancelled" ? "danger" : "neutral";

export default async function ContractsPage() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const allowed = ["organization_administrator", "area_manager", "operations_manager"].includes(access.role);
  const contracts = allowed ? await listContracts(client, access) : [];
  return <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
    <SectionTabs items={getFinanceSectionTabs(access)} currentPath="/finance/contracts" ariaLabel="Finance sections" />
    <section className="accessState contractRegister">
      <p className="eyebrow">Finance / contracts</p>
      <h1>Contract register</h1>
      {!allowed ? <Alert tone="restricted">Contract administration is restricted.</Alert> : <>
        <p>Approved terms become operational requirements and expected revenue only after Director activation.</p>
        {access.role !== "operations_manager" && <p><Link href="/finance/contracts/new">Create manual contract</Link></p>}
        <KpiCardGrid ariaLabel="Contract register counts">
          <KpiCard label="Contracts" value={contracts.length} />
          <KpiCard label="Active versions" value={contracts.filter((contract) => contract.versions[0]?.state === "active").length} />
          <KpiCard label="Awaiting review" value={contracts.filter((contract) => contract.versions[0]?.state === "in_review").length} />
        </KpiCardGrid>
        {contracts.length === 0 ? <Alert tone="info">No contracts are available for your assigned casinos.</Alert> :
          <ul className="contractRegisterList">{contracts.map((contract) => {
            const version = contract.versions[0];
            return <li key={contract.id} className="contractRegisterItem">
              <div><Link href={`/finance/contracts/${contract.id}/review`}>{contract.code} · {contract.name}</Link><p>{contract.siteName} · {version ? `v${version.version_number}` : "no version"}{version?.effective_from ? ` · ${version.effective_from}${version.effective_to ? ` to ${version.effective_to}` : " onward"}` : ""}{version ? ` · ${version.source_type}` : ""}</p></div>
              {version && <StatusBadge tone={versionTone(version.state)}>{version.state.replaceAll("_", " ")}</StatusBadge>}
            </li>;
          })}</ul>}
      </>}
    </section>
  </AppShell>;
}
