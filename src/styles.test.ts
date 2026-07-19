import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("keyboard layout styles", () => {
  it("uses zero-width black-key flow and widens only marked white keys", () => {
    expect(styles).toMatch(/\.keyboard\s*\{[^}]*display:\s*flex;/s);
    expect(styles).not.toMatch(/\.keyboard\s*\{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(/\.piano-key\s*\{[^}]*flex:\s*0 0 auto;/s);
    expect(styles).toMatch(/\.piano-key\.white\s*\{[^}]*width:\s*18px;/s);
    expect(styles).toMatch(/\.piano-key\.white\.wide-white-key\s*\{[^}]*width:\s*18px;/s);
    expect(styles).not.toMatch(/\.piano-key\.white\.wide-white-key\s*\{[^}]*width:\s*36px;/s);
    expect(styles).toMatch(
      /\.piano-key\.black\s*\{[^}]*margin-left:\s*-7px;[^}]*margin-right:\s*-7px;[^}]*width:\s*14px;/s
    );
  });
});

describe("seven-slot recommendation styles", () => {
  it("keeps tabs scrollable and candidates responsive without suppressing focus", () => {
    expect(styles).toMatch(/\.recommendation-tabs\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(styles).toMatch(/\.recommendation-tab\[aria-selected="true"\]\s*\{/s);
    expect(styles).toMatch(/\.recommendation-candidates\s*\{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(
      /\.recommendation-candidates\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(10rem,\s*1fr\)\);/s,
    );
    expect(styles).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*\.recommendation-apply/s);
    expect(styles).not.toMatch(/\.recommendation[^}]*outline:\s*none/s);
  });
});
