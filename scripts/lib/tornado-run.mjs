// #114: run manifest and repeat-run comparison for the Tornado recorder. Pure functions, unit tested
// in tests/tornado-run.test.ts. The manifest names accounts by role and never contains credentials.

const CHAPTER_TITLE = /^(UAT-[0-9A-Z]+)\s+(.*)$/;

/** Flatten Playwright JSON reporter output into { title, test } pairs. */
function specs(report) {
  const found = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) found.push({ title: spec.title, test });
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return found;
}

const statusOf = (test) => {
  const last = test.results?.at(-1);
  if (!last) return "not-run";
  if (last.status === "skipped" || test.status === "skipped") return "skipped";
  return last.status === "passed" ? "passed" : "failed";
};

export function chaptersFromReport(report) {
  return specs(report).flatMap(({ title, test }) => {
    const match = CHAPTER_TITLE.exec(title);
    if (!match) return [];
    const annotations = test.annotations ?? [];
    const last = test.results?.at(-1) ?? {};
    return [{
      id: match[1],
      title: match[2],
      status: statusOf(test),
      skipReason: annotations.find((a) => a.type === "skip")?.description || undefined,
      accounts: annotations.filter((a) => a.type === "account").map((a) => a.description),
      consoleErrors: Number(annotations.find((a) => a.type === "console-errors")?.description ?? 0),
      durationMs: last.duration ?? 0,
      screenshots: (last.attachments ?? []).filter((a) => a.contentType === "image/png" && a.name !== "screenshot").map((a) => `${a.name}.png`),
      error: last.error?.message ? String(last.error.message).split("\n")[0].slice(0, 240) : undefined,
    }];
  });
}

export function buildRunManifest({ preflight, report, presenter, expected, recorder, deploymentCommit, finishedAt }) {
  const chapters = chaptersFromReport(report);
  const count = (status) => chapters.filter((c) => c.status === status).length;
  const local = preflight?.mode === "local";
  return {
    schema: 1,
    target: { baseURL: preflight?.baseURL, mode: preflight?.mode },
    startedAt: preflight?.startedAt,
    finishedAt,
    recorder,
    deployment: deploymentCommit
      ? { commit: deploymentCommit, source: "TORNADO_DEPLOYMENT_COMMIT" }
      : local ? { commit: recorder?.commit, dirty: recorder?.dirty, source: "local working tree" }
        : { commit: null, source: "not provided: set TORNADO_DEPLOYMENT_COMMIT to the hosted deployment's commit" },
    scenario: expected ? {
      scenarioId: expected.scenarioId, runId: expected.runId, seed: expected.seed,
      generatorVersion: expected.generatorVersion, siteCount: expected.controlTotals?.siteCount,
    } : null,
    credentials: {
      demoPasswordPresent: Boolean(preflight?.credentialsPresent),
      operationsPasswordPresent: Boolean(preflight?.legacyOperationsCredentialsPresent),
    },
    totals: { chapters: chapters.length, passed: count("passed"), failed: count("failed"), skipped: count("skipped"),
      consoleErrors: chapters.reduce((sum, c) => sum + c.consoleErrors, 0) },
    chapters,
    presenter: presenter ? { video: `presenter/${presenter.video}`, chapters: presenter.chapters } : null,
  };
}

/** Throws if any secret value appears anywhere in the serialized manifest. */
export function assertNoSecrets(serialized, secrets) {
  const leaked = secrets.filter((value) => typeof value === "string" && value.length >= 6 && serialized.includes(value));
  if (leaked.length) throw new Error("The run manifest would contain a credential value; it was not written.");
}

/** Differences that matter between two runs of the same storyboard. Empty array means equivalent. */
export function compareRuns(a, b) {
  const differences = [];
  const order = (run) => run.chapters.map((c) => c.id).join(" ");
  if (order(a) !== order(b)) differences.push(`Chapter order differs: [${order(a)}] vs [${order(b)}]`);
  const byId = new Map(b.chapters.map((c) => [c.id, c]));
  for (const left of a.chapters) {
    const right = byId.get(left.id);
    if (!right) { differences.push(`${left.id} is missing from the second run`); continue; }
    if (left.status !== right.status) differences.push(`${left.id} status: ${left.status} vs ${right.status}`);
    const shotsA = [...left.screenshots].sort().join(", "), shotsB = [...right.screenshots].sort().join(", ");
    if (shotsA !== shotsB) differences.push(`${left.id} screenshots: [${shotsA}] vs [${shotsB}]`);
    if (left.consoleErrors || right.consoleErrors) differences.push(`${left.id} console errors: ${left.consoleErrors} vs ${right.consoleErrors}`);
  }
  const reel = (run) => (run.presenter?.chapters ?? []).map((c) => `${c.id}:${c.status}`).join(" ");
  if (reel(a) !== reel(b)) differences.push(`Presenter chapters differ: [${reel(a)}] vs [${reel(b)}]`);
  if (a.scenario?.runId !== b.scenario?.runId) differences.push(`Scenario run differs: ${a.scenario?.runId ?? "none"} vs ${b.scenario?.runId ?? "none"}`);
  return differences;
}
