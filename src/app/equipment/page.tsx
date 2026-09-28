import { AppShell } from "@/components/app-shell";
import { AssetRegister, type AssetRegisterRow } from "@/components/asset-register";
import { Alert, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { listEquipmentAssets } from "@/integrations/equipment/supabase-equipment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;

function serviceWindow(now = new Date()) {
  return { today: now.toISOString().slice(0, 10), soon: new Date(now.getTime() + 30 * DAY).toISOString().slice(0, 10) };
}

export default async function EquipmentPage() {
  const client = await createSupabaseServerClient();
  const access = await getAppAccessContext(client);
  const allowed = ["site_supervisor", "area_manager", "operations_manager", "organization_administrator"].includes(access.role);
  const assets = allowed ? await listEquipmentAssets(client, access) : [];
  const siteNames = new Map(access.sites.map((site) => [site.id, site.name]));
  const { today, soon } = serviceWindow();
  const rows: AssetRegisterRow[] = assets.map((asset) => ({
    id: asset.id,
    code: asset.asset_code,
    site: siteNames.get(asset.site_id) ?? "Assigned site",
    model: `${asset.equipment_models?.manufacturer ?? "Unknown manufacturer"} ${asset.equipment_models?.model_name ?? "Unknown model"}`,
    category: asset.equipment_models?.category ?? null,
    status: asset.status,
    condition: asset.condition,
    nextService: asset.next_service_date,
    serviceOverdue: Boolean(asset.next_service_date && asset.next_service_date < today),
  }));
  const ready = assets.filter((asset) => asset.status === "available" || asset.status === "in_use").length;
  const attention = assets.filter((asset) => asset.status === "maintenance" || asset.status === "out_of_service").length;
  const due = assets.filter((asset) => asset.next_service_date && asset.next_service_date <= soon).length;
  const casinos = new Set(assets.map((asset) => asset.site_id)).size;

  return <AppShell authenticated currentPath="/equipment" role={access.role} roleLabel={access.roleLabel}>
    <div className="pageStack">
      <header className="financeHeader">
        <div>
          <p className="eyebrow">Equipment care</p>
          <h1>Asset register</h1>
          <p>Site-scoped equipment history. Faults and repeated repairs are neutral records, not a finding of cause.</p>
        </div>
        {allowed ? <StatusBadge tone="neutral">{casinos} {casinos === 1 ? "casino" : "casinos"}</StatusBadge> : null}
      </header>
      {!allowed ? <Alert tone="restricted">This role cannot view equipment care.</Alert>
        : assets.length === 0 ? <Alert tone="info">No equipment assets are available for your assigned sites.</Alert>
        : <>
          <KpiCardGrid>
            <KpiCard variant="hero" label="Assets" value={assets.length} help={`Across ${casinos} assigned ${casinos === 1 ? "casino" : "casinos"}`} />
            <KpiCard label="Ready for use" value={ready} help="Available or in use" />
            <KpiCard label="Needs attention" value={attention} help="In maintenance or out of service" />
            <KpiCard label="Service due" value={due} help="Within 30 days, including overdue" />
          </KpiCardGrid>
          <AssetRegister rows={rows} />
        </>}
    </div>
  </AppShell>;
}
