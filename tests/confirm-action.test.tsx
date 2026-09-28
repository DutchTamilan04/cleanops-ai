import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmAction } from "@/components/ui";

const props = {
  label: "Close balanced period",
  title: "Close this finance period?",
  consequence: "Closing freezes this month's metrics as a versioned snapshot.",
  confirmLabel: "Close period",
};

describe("#155 ConfirmAction", () => {
  it("renders a non-submitting trigger that announces a dialog", () => {
    const html = renderToStaticMarkup(<ConfirmAction {...props} />);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-haspopup="dialog"[^>]*>Close balanced period<\/button>/);
    expect(html).toContain('class="ui-button ui-button-primary"');
  });

  it("keeps the dialog closed until the trigger is used, labelled by its question and consequence", () => {
    const html = renderToStaticMarkup(<ConfirmAction {...props} />);
    const dialog = /<dialog([^>]*)>/.exec(html)?.[1] ?? "";
    expect(dialog).not.toContain("open");
    const titleId = /aria-labelledby="([^"]+)"/.exec(dialog)?.[1];
    const consequenceId = /aria-describedby="([^"]+)"/.exec(dialog)?.[1];
    expect(html).toContain(`<h2 id="${titleId}" class="ui-dialog-title">Close this finance period?</h2>`);
    expect(html).toContain(`id="${consequenceId}"`);
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain(">Close period</button>");
  });

  it("never renders a submit button inside the dialog, so only the decision button acts", () => {
    const html = renderToStaticMarkup(<ConfirmAction {...props} />);
    expect(html).not.toContain('type="submit"');
  });

  it("uses the danger decision style for danger triggers and navy otherwise", () => {
    expect(renderToStaticMarkup(<ConfirmAction {...props} variant="danger" />)).toContain('class="ui-button ui-button-danger">Close period');
    expect(renderToStaticMarkup(<ConfirmAction {...props} />)).toContain('class="ui-button ui-button-navy">Close period');
  });

  it("shows optional record details and honours disabled", () => {
    const html = renderToStaticMarkup(
      <ConfirmAction {...props} disabled details={[{ label: "Month", value: "2026-08" }]} />,
    );
    expect(html).toContain("<dt>Month</dt><dd>2026-08</dd>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-haspopup="dialog"/);
  });
});
