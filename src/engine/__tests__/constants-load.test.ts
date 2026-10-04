// The engine thresholds are module-load values (DR-076): a bad one throws while
// constants.ts loads, which breaks the import of every engine test file. Stryker counts a
// file that fails to import as no test run, so a broken literal "survived" (DR-168). These
// tests import the module inside the test, so a load failure fails a test.
import { describe, it, expect } from "vitest";

describe("engine constants (DR-076)", () => {
  it("the tolerances load with their documented values", async () => {
    const c = await import("../constants");
    expect(c.IRR_NPV_TOLERANCE.toString()).toBe("1e-9");
    expect(c.DEBT_FREE_EPSILON.toString()).toBe("0.005");
    expect(c.FULLY_AMORTIZES_TOLERANCE.toString()).toBe("1");
  });

  it("the IRR scan grid runs from −90 % to +1000 %, ascending", async () => {
    const { IRR_SCAN_GRID: grid } = await import("../constants");
    expect(grid[0]?.toString()).toBe("-0.9");
    expect(grid.at(-1)?.toString()).toBe("10");
    expect(grid.map(String)).toContain("0");
    grid.slice(1).forEach((r, i) => {
      expect(r.greaterThan(grid[i]!), `${grid[i]} < ${r}`).toBe(true);
    });
  });
});
