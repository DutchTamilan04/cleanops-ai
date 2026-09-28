// #114: local rehearsal of the Tornado walkthrough against local Supabase only.
// Prerequisite: `npx supabase start` and `npm run demo:generate -- finance-showcase`.
// Sets a local-only password on the generated finance-showcase personas (like scripts/run-e2e.mjs does
// for the E2E personas), then runs the normal recorder. Legacy operations chapters stay skipped unless
// TORNADO_OPERATIONS_PASSWORD is set for accounts that exist locally.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
const apiUrl = status.API_URL ?? status.api_url;
const publishableKey = status.ANON_KEY ?? status.anon_key ?? status.PUBLISHABLE_KEY;
const secretKey = status.SERVICE_ROLE_KEY ?? status.service_role_key ?? status.SECRET_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(apiUrl ?? "")) {
  console.error("Local rehearsal only runs against local Supabase (supabase status did not report a local API URL).");
  process.exit(2);
}
if (process.env.TORNADO_DEMO_BASE_URL && process.env.TORNADO_DEMO_BASE_URL !== "http://127.0.0.1:3000") {
  console.error("Unset TORNADO_DEMO_BASE_URL: the local rehearsal records the local app only.");
  process.exit(2);
}
const expected = "fixtures/generated/finance-showcase/expected.json";
if (!existsSync(expected)) {
  console.error("Generate the scenario first: npm run demo:generate -- finance-showcase");
  process.exit(2);
}
// Local-only value; the local database is disposable and never reachable from a hosted deployment.
const password = process.env.TORNADO_LOCAL_PASSWORD ?? "cleanops-local-tornado-2026";
const admin = createClient(apiUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
let updated = 0;
for (let page = 1; page < 20; page += 1) {
  const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (listed.error) throw listed.error;
  for (const user of listed.data.users) {
    if (!user.email?.startsWith("finance-showcase.")) continue;
    const result = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (result.error) throw result.error;
    updated += 1;
  }
  if (listed.data.users.length < 200) break;
}
if (!updated) {
  console.error("No finance-showcase personas found locally. Run: npm run demo:generate -- finance-showcase");
  process.exit(2);
}
console.log(`Local rehearsal: set a local-only password on ${updated} finance-showcase personas.`);

const appEnvironment = {
  ...process.env,
  NEXT_PUBLIC_APP_MODE: "prototype",
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SECRET_KEY: secretKey,
  CLEANOPS_HOSTED_DEMO_ENABLED: "true",
};
// Record a production build by default (like the hosted demo). TORNADO_LOCAL_DEV=1 uses the dev server instead.
const production = process.env.TORNADO_LOCAL_DEV !== "1";
if (production) {
  console.log("Local rehearsal: building the app for production (set TORNADO_LOCAL_DEV=1 to skip)…");
  const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { stdio: "inherit", env: appEnvironment });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const run = spawnSync(process.execPath, ["scripts/run-tornado-demo.mjs", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...appEnvironment,
    ...(production ? { TORNADO_DEMO_PRODUCTION: "1" } : {}),
    TORNADO_DEMO_PASSWORD: password,
    TORNADO_EXPECTED_MANIFEST: process.env.TORNADO_EXPECTED_MANIFEST ?? expected,
  },
});
process.exit(run.status ?? 1);
