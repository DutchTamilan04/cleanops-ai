"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, FilterBar, StatusBadge, type DataTableColumn } from "@/components/ui";
import { ASSET_STATUS_FILTERS, assetConditionLabel, assetStatusLabel } from "@/config/equipment-labels";

export type AssetRegisterRow = {
  id: string;
  code: string;
  site: string;
  model: string;
  category: string | null;
  status: string;
  condition: string;
  nextService: string | null;
  serviceOverdue: boolean;
};

const columns: DataTableColumn<AssetRegisterRow>[] = [
  {
    key: "asset",
    header: "Asset",
    render: (row) => <span className="assetCell">
      <Link href={`/equipment/${row.id}`} className="assetCell-link">{row.code}</Link>
      {row.category ? <span className="assetCell-meta">{row.category}</span> : null}
    </span>,
  },
  { key: "site", header: "Casino", render: (row) => row.site },
  { key: "model", header: "Model", render: (row) => row.model },
  {
    key: "status",
    header: "Status",
    render: (row) => { const status = assetStatusLabel(row.status); return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>; },
  },
  { key: "condition", header: "Condition", render: (row) => assetConditionLabel(row.condition).label },
  {
    key: "service",
    header: "Next service",
    render: (row) => row.nextService
      ? <span className="assetCell">{row.nextService}{row.serviceOverdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : null}</span>
      : <span className="assetCell-meta">Not scheduled</span>,
  },
];

export function AssetRegister({ rows }: { rows: AssetRegisterRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => (!status || row.status === status) &&
      (!term || [row.code, row.site, row.model, row.category ?? ""].some((value) => value.toLowerCase().includes(term))));
  }, [rows, search, status]);
  return (
    <section className="financePanel" aria-labelledby="asset-list-title">
      <div className="panelHeading"><div><h2 id="asset-list-title">Assets</h2></div><span>Select an asset code to open its care history</span></div>
      <FilterBar
        searchLabel="Search assets"
        searchValue={search}
        onSearchChange={setSearch}
        resultCount={visible.length}
        chips={ASSET_STATUS_FILTERS.map((value) => ({ value, label: assetStatusLabel(value).label }))}
        activeChip={status}
        onChipChange={setStatus}
        onClear={() => { setSearch(""); setStatus(null); }}
      />
      <DataTable
        caption="Equipment assets at assigned casinos"
        columns={columns}
        rows={visible}
        getRowKey={(row) => row.id}
        emptyMessage="No assets match these filters."
      />
    </section>
  );
}
