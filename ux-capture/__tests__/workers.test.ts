// UX_WORKERS caps the capture's Playwright workers for every run (`pnpm ux:capture`,
// `pnpm ux:readme`, `pnpm ux:baseline`), read by playwright.ux.config.ts via workersOf.
import { describe, expect, it } from "vitest";
import { workersOf } from "../matrix.ts";

describe("workersOf", () => {
  it("leaves Playwright's default when UX_WORKERS is unset or empty", () => {
    expect(workersOf({})).toBeUndefined();
    expect(workersOf({ UX_WORKERS: "" })).toBeUndefined();
  });

  it("takes a positive whole number", () => {
    expect(workersOf({ UX_WORKERS: "3" })).toBe(3);
  });

  it("rejects anything else", () => {
    for (const bad of ["0", "-1", "2.5", "many", "50%"])
      expect(() => workersOf({ UX_WORKERS: bad })).toThrow(/UX_WORKERS/);
  });
});
