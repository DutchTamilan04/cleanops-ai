import { test, type Page } from "@playwright/test";
import { accountLabels, ChapterSkip, chapters, type AccountKey } from "./chapters";
import { accounts, consoleErrorsFor, passwordFor, signIn, watchConsole } from "./flows";

// The pinned acceptance run (#38 Gate A). One test per storyboard chapter; the storyboard itself
// lives in chapters.ts and is shared with the presenter reel (tornado-presenter.spec.ts, #114).
test.describe("Tornado synthetic demo recording", () => {
  for (const chapter of chapters) {
    test(`${chapter.id} ${chapter.title}`, async ({ page, browser }) => {
      const reason = chapter.unavailable?.();
      test.skip(Boolean(reason), reason);
      for (const account of new Set(chapter.accounts)) {
        test.info().annotations.push({ type: "account", description: accountLabels[account] });
      }
      watchConsole(page);
      const pages = new Map<AccountKey, Page>();
      const opened: Page[] = [];
      let fixtureAccount: AccountKey | undefined;
      const ctx = {
        async page(account: AccountKey) {
          const existing = pages.get(account);
          if (existing) return existing;
          // The fixture page serves the first account, and a signed-out page may become signed in
          // (UAT-01). Any other account gets its own browser context, so sessions never mix.
          let target: Page;
          if (fixtureAccount === undefined || (fixtureAccount === "public" && account !== "public")) {
            if (fixtureAccount) pages.delete(fixtureAccount);
            target = page;
            fixtureAccount = account;
          } else {
            target = await browser.newPage();
            opened.push(target);
            watchConsole(target);
          }
          if (account !== "public") await signIn(target, accounts[account], passwordFor(account));
          pages.set(account, target);
          return target;
        },
      };
      try {
        await test.step(chapter.summary, async () => {
          try {
            await chapter.run(ctx);
          } catch (error) {
            if (error instanceof ChapterSkip) test.skip(true, error.message);
            throw error;
          }
        });
      } finally {
        const errors = [page, ...opened].flatMap(consoleErrorsFor);
        test.info().annotations.push({ type: "console-errors", description: String(errors.length) });
        if (errors.length) await test.info().attach("console-errors", { body: errors.join("\n"), contentType: "text/plain" });
        for (const extra of opened) await extra.close();
      }
      if (process.env.TORNADO_FAIL_ON_CONSOLE_ERRORS === "1") {
        const errors = [page, ...opened].flatMap(consoleErrorsFor);
        if (errors.length) throw new Error(`${errors.length} browser console error(s): ${errors[0]}`);
      }
    });
  }
});
