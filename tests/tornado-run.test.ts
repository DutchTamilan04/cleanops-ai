import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { assertNoSecrets, buildRunManifest, chaptersFromReport, compareRuns } from "../scripts/lib/tornado-run.mjs";

// #114: shape of Playwright's JSON reporter output, reduced to what the manifest reads.
const report = (overrides: Record<string, { status: string; annotations?: { type: string; description?: string }[]; screenshots?: string[] }>) => ({
  suites: [{
    title: "tornado-demo.spec.ts",
    suites: [{
      title: "Tornado synthetic demo recording",
      specs: Object.entries(overrides).map(([title, value]) => ({
        title,
        tests: [{
          status: value.status === "skipped" ? "skipped" : "expected",
          annotations: value.annotations ?? [],
          results: [{
            status: value.status, duration: 1200,
            attachments: (value.screenshots ?? []).map((name) => ({ name, contentType: "image/png", path: `/x/${name}.png` })),
          }],
        }],
      })),
    }],
  }],
});

const baseline = report({
  "UAT-02 Director Dashboard": { status: "passed", screenshots: ["02-director-dashboard"],
    annotations: [{ type: "account", description: "Generated Director" }, { type: "console-errors", description: "0" }] },
  "UAT-05 Cleaning evidence review": { status: "skipped", annotations: [{ type: "skip", description: "Legacy password required." }] },
  "Presenter reel @presenter": { status: "passed" },
});

describe("Tornado run manifest", () => {
  it("reads chapters, accounts, screenshots and skip reasons from the reporter output", () => {
    const chapters = chaptersFromReport(baseline);
    expect(chapters.map((c: { id: string }) => c.id)).toEqual(["UAT-02", "UAT-05"]);
    expect(chapters[0]).toMatchObject({ status: "passed", accounts: ["Generated Director"], screenshots: ["02-director-dashboard.png"], consoleErrors: 0 });
    expect(chapters[1]).toMatchObject({ status: "skipped", skipReason: "Legacy password required." });
  });

  it("records scenario, deployment and totals without credential values", () => {
    const manifest = buildRunManifest({
      preflight: { baseURL: "http://127.0.0.1:3000", mode: "local", credentialsPresent: true, legacyOperationsCredentialsPresent: false, startedAt: "t0" },
      report: baseline, presenter: null,
      expected: { scenarioId: "finance-showcase", runId: "run-1", seed: 20260922, generatorVersion: 9, controlTotals: { siteCount: 4 } },
      recorder: { commit: "abc123", dirty: false }, finishedAt: "t1",
    });
    expect(manifest.scenario).toEqual({ scenarioId: "finance-showcase", runId: "run-1", seed: 20260922, generatorVersion: 9, siteCount: 4 });
    expect(manifest.deployment).toMatchObject({ commit: "abc123", source: "local working tree" });
    expect(manifest.totals).toMatchObject({ chapters: 2, passed: 1, skipped: 1, failed: 0 });
    expect(manifest.credentials).toEqual({ demoPasswordPresent: true, operationsPasswordPresent: false });
  });

  it("says when a hosted run has no deployment commit", () => {
    const manifest = buildRunManifest({ preflight: { mode: "external" }, report: baseline, recorder: { commit: "abc" } });
    expect(manifest.deployment.commit).toBeNull();
    expect(manifest.deployment.source).toMatch(/TORNADO_DEPLOYMENT_COMMIT/);
  });

  it("refuses to write a manifest that contains a credential", () => {
    expect(() => assertNoSecrets('{"note":"s3cret-password"}', ["s3cret-password"])).toThrow(/credential/);
    expect(() => assertNoSecrets('{"note":"fine"}', ["s3cret-password", undefined])).not.toThrow();
  });
});

describe("Tornado repeat-run comparison", () => {
  const manifestOf = (value: ReturnType<typeof report>) => buildRunManifest({ preflight: { mode: "local" }, report: value, recorder: {} });

  it("treats identical runs as equivalent", () => {
    expect(compareRuns(manifestOf(baseline), manifestOf(baseline))).toEqual([]);
  });

  it("reports status, screenshot and console-error differences", () => {
    const changed = report({
      "UAT-02 Director Dashboard": { status: "failed", screenshots: [], annotations: [{ type: "console-errors", description: "2" }] },
      "UAT-05 Cleaning evidence review": { status: "skipped" },
    });
    const differences = compareRuns(manifestOf(baseline), manifestOf(changed));
    expect(differences).toEqual(expect.arrayContaining([
      "UAT-02 status: passed vs failed",
      expect.stringMatching(/^UAT-02 screenshots:/),
      "UAT-02 console errors: 0 vs 2",
    ]));
  });
});
