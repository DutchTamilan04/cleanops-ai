import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CasinoSwitcher } from "@/components/ui/casino-switcher";
import { SectionTabs } from "@/components/ui/section-tabs";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import type { AppRole } from "@/services/access-context";

const accessFor = (role: AppRole) => ({
  role,
  canViewFinance: role === "organization_administrator" || role === "area_manager",
  canEditFinance: role === "organization_administrator",
  canManageOperations: !["cleaner", "client_viewer"].includes(role),
});

describe("UI promotion preserves form scope and navigation access", () => {
  it("submits the authorized casino when a single-site switcher becomes a static label", () => {
    const html = renderToStaticMarkup(<form><CasinoSwitcher name="siteId"
      sites={[{ id: "authorized-site", name: "Assigned casino" }]}
      selectedId="ignored-query-value" /></form>);
    expect(html).toContain('type="hidden" name="siteId" value="authorized-site"');
    expect(html).toContain("Assigned casino");
    expect(html).not.toContain("ignored-query-value");
  });

  it("keeps all-site selection available where aggregation is supported", () => {
    const html = renderToStaticMarkup(<CasinoSwitcher name="siteId" allowAll
      sites={[{ id: "authorized-site", name: "Assigned casino" }]} selectedId="all" />);
    expect(html).toContain('<select name="siteId"');
    expect(html).toContain('value="all" selected=""');
  });

  it.each([
    ["organization_administrator", 8, true],
    ["area_manager", 7, false],
    ["operations_manager", 2, false],
    ["site_supervisor", 1, false],
    ["cleaner", 0, false],
    ["client_viewer", 0, false],
  ] as const)("shows only permitted Finance tabs for %s", (role, count, rates) => {
    const html = renderToStaticMarkup(<SectionTabs items={getFinanceSectionTabs(accessFor(role))}
      currentPath="/finance/time" ariaLabel="Finance sections" />);
    expect((html.match(/<a /g) ?? []).length).toBe(count);
    expect(html.includes('href="/finance/rates"')).toBe(rates);
    if (!accessFor(role).canViewFinance) {
      expect(html).not.toContain('href="/finance"');
      expect(html).not.toContain('href="/finance/reconciliation"');
    }
    if (!count) expect(html).toBe("");
  });
});
