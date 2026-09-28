const ISSUE_TITLE = "CLEAN-014D: production adapter worker alert";
const ISSUE_MARKER = "<!-- cleanops-adapter-worker-monitor -->";
const SAFE_CODES = new Set([
  "dead_letter_present", "pending_age_exceeded", "retries_pending",
]);

export function classifyWorkerResponse(status, body) {
  if (status === 200 && body && typeof body === "object"
      && body.status !== "adapter_disabled" && Array.isArray(body.alertCodes)
      && body.alertCodes.every((code) => typeof code === "string")
      && body.alertCodes.length === 0 && body.health
      && typeof body.health.pendingCount === "number") {
    return { healthy: true, code: "healthy", status };
  }
  const codes = Array.isArray(body?.alertCodes)
    ? body.alertCodes.filter((code) => SAFE_CODES.has(code)) : [];
  const code = body?.status === "adapter_disabled" ? "adapter_disabled"
    : body?.error === "unauthorized" ? "unauthorized"
      : body?.error === "worker_unavailable" ? "worker_unavailable"
        : codes.join(",") || "unexpected_response";
  return { healthy: false, code, status };
}

function githubHeaders(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  };
}

async function githubRequest(fetchImpl, url, token, method = "GET", body) {
  const response = await fetchImpl(url, {
    method, headers: githubHeaders(token),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`GitHub issue API returned ${response.status}`);
  return response.json();
}

export async function runMonitor({ fetchImpl = fetch, env = process.env, now = new Date() } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const githubToken = env.GITHUB_TOKEN;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "") || !githubToken) {
    throw new Error("GitHub issue destination is not configured");
  }
  const assignee = env.CLEANOPS_ADAPTER_ALERT_ASSIGNEE || repo.split("/")[0];
  if (!/^[A-Za-z0-9-]{1,39}$/.test(assignee)) throw new Error("Invalid alert assignee");
  const api = `https://api.github.com/repos/${repo}/issues`;
  let result;
  try {
    const url = new URL(env.CLEANOPS_ADAPTER_WORKER_URL);
    if (url.protocol !== "https:" || url.hostname !== "cleanops-ai.vercel.app"
        || url.username || url.password || url.search || url.hash
        || url.pathname !== "/api/internal/integrations/worker"
        || !env.CLEANOPS_EVENT_WORKER_TOKEN) throw new Error("invalid monitor configuration");
    const response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${env.CLEANOPS_EVENT_WORKER_TOKEN}` },
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    result = classifyWorkerResponse(response.status, body);
  } catch {
    result = { healthy: false, code: "request_or_configuration_failed", status: null };
  }

  const issues = await githubRequest(fetchImpl, `${api}?state=open&per_page=100`, githubToken);
  const existing = issues.find((issue) => issue.title === ISSUE_TITLE
    && issue.body?.includes(ISSUE_MARKER) && !issue.pull_request);
  if (result.healthy) {
    if (existing) {
      await githubRequest(fetchImpl, `${api}/${existing.number}`, githubToken, "PATCH", {
        state: "closed", state_reason: "completed",
      });
    }
    return result;
  }
  if (!existing) {
    const checkedAt = now.toISOString();
    await githubRequest(fetchImpl, api, githubToken, "POST", {
      title: ISSUE_TITLE,
      assignees: [assignee],
      body: `${ISSUE_MARKER}\nProduction adapter worker check failed at ${checkedAt}.\n\n`
        + `Safe signal: \`${result.code}\`; HTTP status: \`${result.status ?? "none"}\`.\n\n`
        + "Inspect the protected worker response and Vercel logs, then follow "
        + "`docs/operations/EVENT_ADAPTER_RUNBOOK.md`. No tenant data or credential is in this alert.",
    });
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runMonitor().then((result) => {
    console.log(`Adapter worker monitor: ${result.code} (HTTP ${result.status ?? "none"})`);
    if (!result.healthy) process.exitCode = 1;
  }).catch((error) => {
    console.error(`Adapter worker monitor failed: ${error.message}`);
    process.exitCode = 1;
  });
}
