import type { SectionTabItem } from "@/components/ui/section-tabs";
import type { AppAccessContext } from "@/services/access-context";

export function getFinanceSectionTabs(access: Pick<AppAccessContext, "role" | "canViewFinance" | "canEditFinance" | "canManageOperations">): SectionTabItem[] {
  const canViewContracts = ["organization_administrator", "area_manager", "operations_manager"].includes(access.role);
  return [
    { label: "Overview", href: "/finance", hidden: !access.canViewFinance },
    { label: "Contracts", href: "/finance/contracts", hidden: !canViewContracts },
    { label: "Projects", href: "/finance/projects", hidden: !access.canViewFinance },
    { label: "Finance Inbox", href: "/finance/inbox", hidden: !access.canViewFinance },
    { label: "Expenses", href: "/finance/expenses", hidden: !access.canViewFinance },
    { label: "Time & labour", href: "/finance/time", hidden: !access.canManageOperations },
    { label: "Reconciliation", href: "/finance/reconciliation", hidden: !access.canViewFinance },
    { label: "Rates", href: "/finance/rates", hidden: !access.canEditFinance },
  ];
}
