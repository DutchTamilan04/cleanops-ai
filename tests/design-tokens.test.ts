import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// #178: globals.css uses UX system V2 tokens only (docs/design/UX_SYSTEM_V2.md §1).
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
});
