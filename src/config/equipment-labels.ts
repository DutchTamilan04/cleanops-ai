type Tone = "success" | "pending" | "danger" | "neutral" | "info";

const assetStatus: Record<string, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "success" },
  in_use: { label: "In use", tone: "info" },
  maintenance: { label: "In maintenance", tone: "pending" },
  out_of_service: { label: "Out of service", tone: "danger" },
  proposed: { label: "Proposed", tone: "neutral" },
};

const assetCondition: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "success" },
  good: { label: "Good", tone: "success" },
  fair: { label: "Fair", tone: "neutral" },
  poor: { label: "Poor", tone: "pending" },
  not_applicable: { label: "Not applicable", tone: "neutral" },
};

const supplyState: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Awaiting approval", tone: "pending" },
  approved: { label: "Approved", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
  ordered: { label: "Ordered", tone: "info" },
  partially_received: { label: "Partially received", tone: "pending" },
  received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const humanize = (value: string) => value.replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
const lookup = (table: Record<string, { label: string; tone: Tone }>, value: string) =>
  table[value] ?? { label: humanize(value), tone: "neutral" as Tone };

export const assetStatusLabel = (value: string) => lookup(assetStatus, value);
export const assetConditionLabel = (value: string) => lookup(assetCondition, value);
export const supplyStateLabel = (value: string) => lookup(supplyState, value);
export const readable = humanize;

export const ASSET_STATUS_FILTERS = ["available", "in_use", "maintenance", "out_of_service"] as const;
