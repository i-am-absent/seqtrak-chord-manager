import { resolveConfig } from "vite";
import { describe, expect, it } from "vitest";

describe("GitHub Pages base path", () => {
  it("uses the repository path for production builds", async () => {
    const config = await resolveConfig(
      { root: process.cwd(), configFile: "vite.config.ts" },
      "build",
      "production",
    );

    expect(config.base).toBe("/seqtrak-chord-manager/");
  });

  it("keeps the root path for the local development server", async () => {
    const config = await resolveConfig(
      { root: process.cwd(), configFile: "vite.config.ts" },
      "serve",
      "development",
    );

    expect(config.base).toBe("/");
  });
});
