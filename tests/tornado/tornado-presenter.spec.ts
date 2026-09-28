import { test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { accountLabels, ChapterSkip, chapters, type AccountKey } from "./chapters";
import { accounts, consoleErrorsFor, passwordFor, signIn, watchConsole } from "./flows";

// #114: one continuous, chaptered presenter video built from the same storyboard as the pinned UAT.
// It records only what this run actually showed. A skipped or failed chapter gets an explicit
// "not shown" card; no static or mock screen is substituted. Tagged @presenter so the default
// acceptance run (`npm run demo:tornado`) never includes it.
const out = join(process.cwd(), "artifacts/tornado-demo/presenter");
const size = { width: 1440, height: 900 };

type ChapterResult = {
  id: string; title: string; accounts: string[]; status: "shown" | "skipped" | "failed";
  reason?: string; startSeconds: number; endSeconds: number; consoleErrors: number;
};

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function card(page: Page, { eyebrow, title, body, note, tone = "navy", ms }: {
  eyebrow: string; title: string; body: string; note?: string; tone?: "navy" | "muted"; ms: number;
}) {
  const background = tone === "navy" ? "#00354d" : "#33464f";
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:${background};color:#fff;font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
    main{height:100%;display:grid;align-content:center;padding:0 120px;gap:18px}
    .pill{justify-self:start;padding:6px 14px;border-radius:999px;background:#fff4df;color:#6b4300;font-weight:700;font-size:15px}
    .eyebrow{color:#bcd2df;font-size:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
    h1{margin:0;font-family:Poppins,system-ui,sans-serif;font-size:56px;line-height:1.1;font-weight:600}
    p{margin:0;max-width:980px;color:#dce8ef;font-size:24px;line-height:1.45}
    .note{margin-top:12px;color:#ffd9a8;font-size:20px}
  </style></head><body><main>
    <span class="pill">Prototype · synthetic data</span>
    <span class="eyebrow">${escape(eyebrow)}</span><h1>${escape(title)}</h1><p>${escape(body)}</p>
    ${note ? `<p class="note">${escape(note)}</p>` : ""}
  </main></body></html>`);
  await page.waitForTimeout(ms);
}

const vttTime = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};

test("Presenter reel @presenter", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  process.env.TORNADO_PRESENTER = "1"; // presenter pacing for this test only
  await mkdir(out, { recursive: true });
  // No trace for this context: the reel is meant for review and sharing, and traces can hold typed credentials.
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: out, size } });
  const page = await context.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  watchConsole(page);
  let current: AccountKey | undefined;
  const ctx = {
    async page(account: AccountKey) {
      if (current !== account) {
        await context.clearCookies();
        if (account !== "public") await signIn(page, accounts[account], passwordFor(account));
        current = account;
      }
      return page;
    },
  };
  const results: ChapterResult[] = [];

  await card(page, {
    eyebrow: "CleanOps · Tornado demonstration", title: "A synthetic CleanOps prototype",
    body: "A 24/7 casino cleaning operation, shown with synthetic data. Casino and equipment names are reference examples. These are not Tornado production records or measured outcomes.",
    ms: 5000,
  });

  for (const [index, chapter] of chapters.entries()) {
    if (chapter.id === "UAT-00") continue; // recorder smoke: covered by the login shown in Authentication
    const startSeconds = now();
    const before = consoleErrorsFor(page).length;
    const eyebrow = `Chapter ${index} · ${chapter.id} · ${chapter.accounts.map((a) => accountLabels[a]).join(" + ")}`;
    const unavailable = chapter.unavailable?.();
    let status: ChapterResult["status"] = "shown";
    let reason = unavailable;
    if (unavailable) {
      status = "skipped";
    } else {
      await card(page, { eyebrow, title: chapter.title, body: chapter.summary, ms: 3000 });
      try {
        await chapter.run(ctx);
      } catch (error) {
        status = error instanceof ChapterSkip ? "skipped" : "failed";
        reason = (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 240);
        current = undefined;
      }
    }
    if (status !== "shown") {
      await card(page, {
        eyebrow, title: `${chapter.title}: not shown in this run`, body: chapter.summary,
        note: `${status === "failed" ? "Check failed" : "Unavailable"}: ${reason}`, tone: "muted", ms: 3500,
      });
    }
    results.push({
      id: chapter.id, title: chapter.title, accounts: chapter.accounts.map((a) => accountLabels[a]), status, reason,
      startSeconds: Math.round(startSeconds * 10) / 10, endSeconds: Math.round(now() * 10) / 10,
      consoleErrors: consoleErrorsFor(page).length - before,
    });
  }

  const shown = results.filter((r) => r.status === "shown").length;
  const notShown = results.filter((r) => r.status !== "shown").map((r) => r.title);
  await card(page, {
    eyebrow: "Close", title: `${shown} of ${results.length} chapters shown`,
    body: "Next acceptance work: the controlled finance UAT with source attachments, approvals, access probes, reset and replay, and the agreed accounting and messaging boundaries.",
    note: notShown.length ? `Not shown in this run: ${notShown.join(", ")}.` : undefined, ms: 5000,
  });
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(join(out, "tornado-presenter.webm"));
  if (video) await video.delete();

  const vtt = ["WEBVTT", "", ...results.flatMap((r, i) => [
    `${i + 1}`, `${vttTime(r.startSeconds)} --> ${vttTime(r.endSeconds)}`,
    `${r.id} ${r.title}${r.status === "shown" ? "" : ` (not shown: ${r.status})`}`, "",
  ])].join("\n");
  await writeFile(join(out, "chapters.vtt"), vtt);
  await writeFile(join(out, "chapters.json"), JSON.stringify({ video: "tornado-presenter.webm", size, chapters: results }, null, 2) + "\n");
  await test.info().attach("chapters.json", { path: join(out, "chapters.json"), contentType: "application/json" });

  delete process.env.TORNADO_PRESENTER;
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length) throw new Error(`Presenter reel: ${failed.map((r) => `${r.id} (${r.reason})`).join("; ")}`);
});
