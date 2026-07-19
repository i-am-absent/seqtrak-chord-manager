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
    expect(styles).toMatch(/\.piano-key\.white\.wide-white-key\s*\{[^}]*width:\s*36px;/s);
    expect(styles).toMatch(
      /\.piano-key\.black\s*\{[^}]*margin-left:\s*-7px;[^}]*margin-right:\s*-7px;[^}]*width:\s*14px;/s
    );
  });
});
