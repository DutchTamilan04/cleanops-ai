// #114: one storyboard for both the pinned UAT (tornado-demo.spec.ts) and the presenter reel
// (tornado-presenter.spec.ts). Each chapter states which synthetic account it uses and what the
// visible check proves; a chapter that cannot run throws ChapterSkip with the reason.
import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { accounts, capture, visit } from "./flows";

export type AccountKey = keyof typeof accounts | "public";

export const accountLabels: Record<AccountKey, string> = {
  public: "No account",
  director: "Generated Director",
  area: "Generated Area Manager",
  showcaseSupervisor: "Generated Supervisor",
  legacySupervisor: "Legacy operations Supervisor",
  legacyDirector: "Legacy operations Director",
};

export class ChapterSkip extends Error {}

export type ChapterContext = {
  /** A page signed in as the account (the public account gets a signed-out page). */
  page(account: AccountKey): Promise<Page>;
};

export type Chapter = {
  id: string;
  title: string;
  /** Presenter-facing one-liner shown on the chapter card. */
  summary: string;
  accounts: AccountKey[];
  /** Returns a reason when the chapter cannot run in this environment. */
  unavailable?: () => string | undefined;
  run(ctx: ChapterContext): Promise<void>;
};

const legacyPassword = () => process.env.TORNADO_OPERATIONS_PASSWORD;
const needsLegacy = (what: string) => () =>
  legacyPassword() ? undefined : `The separate legacy operations password is required for ${what}.`;

export const chapters: Chapter[] = [
  {
    id: "UAT-00", title: "Public recorder smoke", summary: "The synthetic prototype login renders without credentials.",
    accounts: ["public"],
    async run(ctx) {
      const page = await ctx.page("public");
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Explore the BC casino operations demo" })).toBeVisible();
      await expect(page.getByText("Prototype · synthetic data")).toBeVisible();
      await capture(page, "00-public-recorder-smoke");
    },
  },
  {
    id: "UAT-01", title: "Authentication", summary: "Named demo roles decide what each person can see.",
    accounts: ["public", "director"],
    async run(ctx) {
      const login = await ctx.page("public");
      await login.goto("/login");
      await expect(login.getByText("Prototype · synthetic data")).toBeVisible();
      await capture(login, "01-authentication-login");
      const page = await ctx.page("director");
      await capture(page, "01-authentication-signed-in");
    },
  },
  {
    id: "UAT-02", title: "Director Dashboard", summary: "Expected revenue, accepted accounting and direct costs, kept separate.",
    accounts: ["director"],
    async run(ctx) {
      const page = await ctx.page("director");
      await visit(page, "/finance?month=2026-08", "Finance & inventory");
      await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
      await capture(page, "02-director-dashboard");
    },
  },
  {
    id: "UAT-03", title: "Casino Operations", summary: "The Supervisor's assigned casino portfolio.",
    accounts: ["showcaseSupervisor"],
    async run(ctx) {
      const page = await ctx.page("showcaseSupervisor");
      await visit(page, "/operations", "Assigned casinos");
      await capture(page, "03-casino-operations");
    },
  },
  {
    id: "UAT-04", title: "Workforce", summary: "Approved time and labour review; no cost is posted from this screen.",
    accounts: ["director"],
    async run(ctx) {
      const page = await ctx.page("director");
      await visit(page, "/finance/time", "Approved time and labour");
      await expect(page.getByRole("heading", { name: "Time review" })).toBeVisible();
      await capture(page, "04-workforce-time-review");
    },
  },
  {
    id: "UAT-05", title: "Cleaning evidence review", summary: "Evidence review with a synthetic pair or its preparation state.",
    accounts: ["legacySupervisor"], unavailable: needsLegacy("cleaning evidence"),
    async run(ctx) {
      const page = await ctx.page("legacySupervisor");
      await visit(page, "/review", "Evidence review");
      await expect(page.getByRole("heading", { name: /Prepare the synthetic evidence pair|Before and after/ }).first()).toBeVisible();
      await capture(page, "05-cleaning-evidence");
    },
  },
  {
    id: "UAT-05B", title: "Mobile cleaning evidence result", summary: "The assigned Slot Bank 14 task and its linked-evidence state.",
    accounts: ["legacyDirector"], unavailable: needsLegacy("the mobile task fixture"),
    async run(ctx) {
      const page = await ctx.page("legacyDirector");
      await visit(page, "/mobile", "Task evidence");
      await expect(page.getByRole("heading", { name: "Slot Bank 14 detail clean" })).toBeVisible();
      if (process.env.TORNADO_EXPECT_MOBILE_EVIDENCE === "1") await expect(page.getByText("Submission ready for review")).toBeVisible();
      await capture(page, "05-mobile-evidence-result");
    },
  },
  {
    id: "UAT-05A", title: "WhatsApp finance source", summary: "A synthetic WhatsApp candidate with its receipt context. No live WhatsApp group.",
    accounts: ["director"],
    async run(ctx) {
      const page = await ctx.page("director");
      await visit(page, "/finance/inbox", "Finance Inbox");
      await expect(page.getByRole("heading", { name: /WhatsApp candidate/ }).first()).toBeVisible();
      await capture(page, "05-whatsapp-finance-source");
    },
  },
  {
    id: "UAT-06", title: "Equipment", summary: "The site-scoped equipment register.",
    accounts: ["showcaseSupervisor"],
    async run(ctx) {
      const page = await ctx.page("showcaseSupervisor");
      await visit(page, "/operations", "Assigned casinos");
      await expect(page.getByText("Equipment register", { exact: true }).first()).toBeVisible();
      await capture(page, "06-equipment-register");
    },
  },
  {
    id: "UAT-06A", title: "Equipment issue report", summary: "A report-only equipment intake. No completed repair is claimed.",
    accounts: ["legacySupervisor"], unavailable: needsLegacy("the issue-report fixture"),
    async run(ctx) {
      const page = await ctx.page("legacySupervisor");
      await visit(page, "/incidents", "Incident & equipment desk");
      await expect(page.getByRole("heading", { name: "Equipment intake" })).toBeVisible();
      await capture(page, "06-equipment-report");
    },
  },
  {
    id: "UAT-07", title: "Incidents", summary: "Attributed wording and a timeline; cause stays undetermined.",
    accounts: ["legacySupervisor"], unavailable: needsLegacy("the incident fixture"),
    async run(ctx) {
      const page = await ctx.page("legacySupervisor");
      await visit(page, "/incidents", "Incident & equipment desk");
      await expect(page.getByRole("heading", { name: "Reported scratch" })).toBeVisible();
      await expect(page.getByText("Cause undetermined")).toBeVisible();
      await capture(page, "07-incident-desk");
    },
  },
  {
    id: "UAT-08", title: "Finance and RBAC", summary: "The Director sees finance sources; the Supervisor is denied internal finance.",
    accounts: ["director", "showcaseSupervisor"],
    async run(ctx) {
      const director = await ctx.page("director");
      await visit(director, "/finance/inbox", "Finance Inbox");
      await capture(director, "08-finance-inbox");
      await visit(director, "/finance/reconciliation", "Accounting reconciliation and period close");
      await capture(director, "08-finance-reconciliation");
      const supervisor = await ctx.page("showcaseSupervisor");
      await supervisor.goto("/finance");
      await expect(supervisor.getByRole("heading", { name: "Finance access restricted" })).toBeVisible();
      await capture(supervisor, "08-rbac-supervisor-denied");
    },
  },
  {
    id: "UAT-09", title: "Scenario Generator", summary: "Visible casino count matches the deterministic scenario's expected-result manifest.",
    accounts: ["director"],
    unavailable: () => process.env.TORNADO_EXPECTED_MANIFEST ? undefined : "Set TORNADO_EXPECTED_MANIFEST to verify the active generated scenario.",
    async run(ctx) {
      const expected = JSON.parse(await readFile(process.env.TORNADO_EXPECTED_MANIFEST!, "utf8")) as
        { scenarioId: string; controlTotals: { siteCount: number } };
      expect(expected.scenarioId).toBe("finance-showcase");
      const page = await ctx.page("director");
      await visit(page, "/finance?month=2026-08", "Finance & inventory");
      await expect(page.locator(".financeSummarySites > article")).toHaveCount(expected.controlTotals.siteCount);
      await capture(page, "09-generated-scenario");
    },
  },
  {
    id: "UAT-10", title: "Existing AI functionality", summary: "Mock AI is labelled as decision support; no live model inference.",
    accounts: ["legacySupervisor"], unavailable: needsLegacy("Mock AI evidence review"),
    async run(ctx) {
      const page = await ctx.page("legacySupervisor");
      await visit(page, "/review", "Evidence review");
      if (await page.getByRole("heading", { name: "Prepare the synthetic evidence pair" }).isVisible()) {
        await capture(page, "10-mock-ai-not-yet-available");
        throw new ChapterSkip("The Restroom B pair is absent; its preparation action is unavailable on this deployment. Slot Bank 14 mobile evidence is a separate task.");
      }
      await expect(page.getByText("Mock AI", { exact: true })).toBeVisible();
      await capture(page, "10-mock-ai-review");
    },
  },
];
