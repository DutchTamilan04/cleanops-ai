import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { assertNoSecrets, buildRunManifest } from "./lib/tornado-run.mjs";

const root = new URL("../artifacts/tornado-demo/", import.meta.url);

const baseURL = process.env.TORNADO_DEMO_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.TORNADO_DEMO_PASSWORD ?? process.env.CLEANOPS_DEMO_PASSWORD;
const publicOnly = process.env.TORNADO_DEMO_PUBLIC_ONLY === "1";
// #114: --presenter also records the chaptered presenter reel; the default run is the pinned UAT only.
const presenter = process.argv.includes("--presenter");
const passthrough = process.argv.slice(2).filter((argument) => argument !== "--presenter");
let target;
try { target = new URL(baseURL); } catch { console.error("TORNADO_DEMO_BASE_URL must be a valid URL."); process.exit(2); }
const local = target.origin === "http://127.0.0.1:3000";
if ((!local && target.protocol !== "https:") || target.pathname !== "/" || target.search || target.hash) {
  console.error("The demo target must be the local origin or an HTTPS origin without a path, query, or fragment.");
  process.exit(2);
}
const allowedOrigin = process.env.TORNADO_DEMO_ALLOWED_ORIGIN;
if (process.env.CI && !local && !allowedOrigin) {
  console.error("CI requires TORNADO_DEMO_ALLOWED_ORIGIN to protect demo credentials.");
  process.exit(2);
}
if (allowedOrigin && target.origin !== allowedOrigin) {
  console.error("The demo target does not match TORNADO_DEMO_ALLOWED_ORIGIN.");
  process.exit(2);
}
const preflight = {
  baseURL,
  mode: local ? "local" : "external",
  credentialsPresent: Boolean(password),
  legacyOperationsCredentialsPresent: Boolean(process.env.TORNADO_OPERATIONS_PASSWORD),
  expectMobileEvidence: process.env.TORNADO_EXPECT_MOBILE_EVIDENCE === "1",
  publicOnly,
  presenter,
  startedAt: new Date().toISOString(),
};
if (!password && !publicOnly) {
  console.error("Tornado demo needs TORNADO_DEMO_PASSWORD (or CLEANOPS_DEMO_PASSWORD). See TORNADO_DEMO.md.");
  process.exit(2);
}
mkdirSync(root, { recursive: true });
for (const part of ["screenshots", "results", "videos-and-traces", "html-report", "presenter"]) {
  rmSync(new URL(part, root), { recursive: true, force: true });
  mkdirSync(new URL(part, root), { recursive: true });
}
writeFileSync(new URL("results/preflight.json", root), JSON.stringify(preflight, null, 2) + "\n");
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const selection = publicOnly ? ["--grep", "UAT-00"]
  : passthrough.some((argument) => argument.startsWith("--grep")) ? passthrough
    : presenter ? passthrough : [...passthrough, "--grep-invert", "@presenter"];
const result = spawnSync(command, ["playwright", "test", "--config=tornado.playwright.config.ts", ...selection], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, TORNADO_DEMO_BASE_URL: baseURL, TORNADO_DEMO_PASSWORD: password },
  stdio: "inherit",
});

// #114: one manifest per run: target, recorder and deployment commit, scenario run and seed, and each
// chapter's accounts (by role), status, screenshots and console errors. No credential values.
const readJson = (relative) => {
  const file = new URL(relative, root);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
};
const git = (...args) => { try { return execFileSync("git", args, { encoding: "utf8" }).trim(); } catch { return null; } };
let expected = null;
if (process.env.TORNADO_EXPECTED_MANIFEST) {
  try { expected = JSON.parse(readFileSync(process.env.TORNADO_EXPECTED_MANIFEST, "utf8")); } catch { expected = null; }
}
const manifest = buildRunManifest({
  preflight,
  report: readJson("results/uat.json"),
  presenter: readJson("presenter/chapters.json"),
  expected,
  recorder: { commit: git("rev-parse", "HEAD"), branch: git("rev-parse", "--abbrev-ref", "HEAD"), dirty: Boolean(git("status", "--porcelain", "--untracked-files=no")) },
  deploymentCommit: process.env.TORNADO_DEPLOYMENT_COMMIT,
  finishedAt: new Date().toISOString(),
});
const serialized = JSON.stringify(manifest, null, 2) + "\n";
assertNoSecrets(serialized, [password, process.env.TORNADO_OPERATIONS_PASSWORD]);
writeFileSync(new URL("results/run-manifest.json", root), serialized);
const { totals } = manifest;
console.log(`\nRun manifest: artifacts/tornado-demo/results/run-manifest.json (${totals.passed} passed, ${totals.skipped} skipped, ${totals.failed} failed, ${totals.consoleErrors} console errors)`);
if (manifest.presenter) console.log(`Presenter reel: artifacts/tornado-demo/${manifest.presenter.video} with presenter/chapters.vtt`);
process.exit(result.status ?? 1);
