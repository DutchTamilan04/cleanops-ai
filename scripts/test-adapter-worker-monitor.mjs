import assert from "node:assert/strict";
import test from "node:test";
import { classifyWorkerResponse, runMonitor } from "./monitor-event-adapter-worker.mjs";

const env = {
  GITHUB_REPOSITORY: "niru2015/cleanops-ai",
  GITHUB_TOKEN: "test-github-token",
  CLEANOPS_ADAPTER_ALERT_ASSIGNEE: "niru2015",
  CLEANOPS_ADAPTER_WORKER_URL: "https://cleanops-ai.vercel.app/api/internal/integrations/worker",
  CLEANOPS_EVENT_WORKER_TOKEN: "test-worker-token-with-sufficient-length",
};

function mockFetch({ workerStatus, workerBody, openIssues = [] }) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith("https://cleanops-ai.vercel.app/")) {
      return Response.json(workerBody, { status: workerStatus });
    }
    if (options.method === "POST") return Response.json({ number: 42 }, { status: 201 });
    if (options.method === "PATCH") return Response.json({ number: 42, state: "closed" });
    return Response.json(openIssues);
  };
  return { fetchImpl, calls };
}

test("classifies a healthy drain and safe failure codes", () => {
  assert.deepEqual(classifyWorkerResponse(200, {
    alertCodes: [], health: { pendingCount: 0 },
  }), { healthy: true, code: "healthy", status: 200 });
  assert.deepEqual(classifyWorkerResponse(503, {
    alertCodes: ["dead_letter_present"], health: { pendingCount: 0 },
  }), { healthy: false, code: "dead_letter_present", status: 503 });
  assert.equal(classifyWorkerResponse(200, { status: "adapter_disabled" }).code, "adapter_disabled");
});

test("creates one assigned issue for a failed production worker", async () => {
  const { fetchImpl, calls } = mockFetch({
    workerStatus: 503, workerBody: { alertCodes: ["dead_letter_present"] },
  });
  const result = await runMonitor({ fetchImpl, env, now: new Date("2026-09-28T20:00:00Z") });
  assert.equal(result.healthy, false);
  const issue = calls.find((call) => call.options.method === "POST");
  const body = JSON.parse(issue.options.body);
  assert.deepEqual(body.assignees, ["niru2015"]);
  assert.match(body.body, /dead_letter_present/);
  assert.doesNotMatch(JSON.stringify(body), /test-worker-token/);
});

test("keeps one open alert and closes it after recovery", async () => {
  const openIssues = [{ number: 42, title: "CLEAN-014D: production adapter worker alert",
    body: "<!-- cleanops-adapter-worker-monitor -->" }];
  const failed = mockFetch({ workerStatus: 503, workerBody: { error: "worker_unavailable" }, openIssues });
  await runMonitor({ fetchImpl: failed.fetchImpl, env });
  assert.equal(failed.calls.filter((call) => call.options.method === "POST").length, 0);
  const healthy = mockFetch({ workerStatus: 200,
    workerBody: { alertCodes: [], health: { pendingCount: 0 } }, openIssues });
  await runMonitor({ fetchImpl: healthy.fetchImpl, env });
  assert.equal(healthy.calls.filter((call) => call.options.method === "PATCH").length, 1);
});

test("configuration failure is visible as an assigned alert", async () => {
  const { fetchImpl, calls } = mockFetch({ workerStatus: 200, workerBody: {} });
  const result = await runMonitor({ fetchImpl, env: { ...env, CLEANOPS_EVENT_WORKER_TOKEN: "" } });
  assert.equal(result.code, "request_or_configuration_failed");
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("refuses to send the worker token to an untrusted host", async () => {
  const { fetchImpl, calls } = mockFetch({ workerStatus: 200, workerBody: {} });
  const result = await runMonitor({ fetchImpl, env: {
    ...env, CLEANOPS_ADAPTER_WORKER_URL: "https://attacker.example/api/internal/integrations/worker",
  } });
  assert.equal(result.code, "request_or_configuration_failed");
  assert.equal(calls.some((call) => call.options.headers?.authorization
    === `Bearer ${env.CLEANOPS_EVENT_WORKER_TOKEN}`), false);
});
