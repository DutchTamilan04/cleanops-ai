import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// #178/#180: globals.css uses UX system V2 tokens, type scale and breakpoints only (docs/design/UX_SYSTEM_V2.md §1).
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rootBlock = css.match(/:root\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
const outsideRoot = css.replace(rootBlock, "");

// Set by next/font in src/app/layout.tsx, not in CSS.
const RUNTIME_VARIABLES = new Set(["--font-display-face", "--font-sans-face"]);

describe("design tokens in globals.css", () => {
  it("has a :root token block", () => {
    expect(rootBlock).toContain("--brand-navy");
  });

  it("uses no raw hex colours outside :root", () => {
    const lines = outsideRoot.split("\n").filter((line) => /#[0-9a-fA-F]{3,8}\b/.test(line));
    expect(lines).toEqual([]);
  });

  it("references only tokens that are defined", () => {
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
    const missing = [...used].filter((name) => !defined.has(name) && !RUNTIME_VARIABLES.has(name));
    expect(missing).toEqual([]);
  });

  it("does not bring back the retired legacy tokens", () => {
    const legacy = ["--navy-950", "--navy-900", "--navy-800", "--cyan-100", "--cyan-300", "--cyan-500", "--canvas",
      "--surface", "--text", "--muted", "--border", "--focus", "--radius", "--shadow"];
    const found = legacy.filter((name) => new RegExp(`${name}(?![\\w-])`).test(css));
    expect(found).toEqual([]);
  });

  it("sets every font size from the type scale", () => {
    const sizes = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((match) => match[1].trim());
    const offScale = sizes.filter((value) => !/^var\(--text-[a-z-]+\)$/.test(value) && value !== "inherit");
    expect(offScale).toEqual([]);
  });

  it("uses only the three layout breakpoints", () => {
    const widths = new Set([...css.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map((match) => Number(match[1])));
    expect([...widths].filter((width) => ![640, 839, 1199].includes(width))).toEqual([]);
  });
});
