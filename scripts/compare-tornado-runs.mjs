// #114: compare two Tornado recorder runs (for example before and after a UI release).
// Usage: npm run demo:tornado:compare -- <first run-manifest.json> <second run-manifest.json>
import { readFileSync } from "node:fs";
import { compareRuns } from "./lib/tornado-run.mjs";

const [first, second] = process.argv.slice(2);
if (!first || !second) {
  console.error("Usage: npm run demo:tornado:compare -- <first run-manifest.json> <second run-manifest.json>");
  process.exit(2);
}
const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const a = load(first), b = load(second);
const summary = (run) => `${run.target?.mode ?? "?"} ${run.target?.baseURL ?? ""} · deployment ${run.deployment?.commit?.slice(0, 7) ?? "unknown"} · ` +
  `${run.totals.passed} passed, ${run.totals.skipped} skipped, ${run.totals.failed} failed, ${run.totals.consoleErrors} console errors`;
console.log(`First:  ${summary(a)}\nSecond: ${summary(b)}\n`);
const differences = compareRuns(a, b);
if (!differences.length) {
  console.log("Equivalent: same chapter order, statuses, screenshots and presenter chapters; no console errors.");
} else {
  console.log(`${differences.length} difference(s):`);
  for (const difference of differences) console.log(`- ${difference}`);
}
process.exit(differences.length ? 1 : 0);
