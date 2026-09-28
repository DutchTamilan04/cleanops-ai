import { defineConfig, devices } from "@playwright/test";

const external = Boolean(process.env.TORNADO_DEMO_BASE_URL && process.env.TORNADO_DEMO_BASE_URL !== "http://127.0.0.1:3000");
export default defineConfig({
  testDir: "./tests/tornado",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  outputDir: "artifacts/tornado-demo/videos-and-traces",
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/tornado-demo/html-report", open: "never" }],
    ["json", { outputFile: "artifacts/tornado-demo/results/uat.json" }],
    ["junit", { outputFile: "artifacts/tornado-demo/results/uat.xml" }],
  ],
  use: {
    baseURL: process.env.TORNADO_DEMO_BASE_URL ?? "http://127.0.0.1:3000",
    ...devices["Desktop Chrome"],
    video: "on",
    trace: "on",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium" }],
  // #114: TORNADO_DEMO_PRODUCTION=1 serves an existing production build (set by demo:tornado:local), so
  // recordings match the hosted app and dev-mode compiles or Fast Refresh reloads cannot interrupt a sign-in.
  webServer: external ? undefined : {
    command: process.env.TORNADO_DEMO_PRODUCTION === "1"
      ? "npm run start -- --hostname 127.0.0.1 --port 3000"
      : "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI && process.env.TORNADO_DEMO_PRODUCTION !== "1",
    timeout: 120_000,
  },
});
