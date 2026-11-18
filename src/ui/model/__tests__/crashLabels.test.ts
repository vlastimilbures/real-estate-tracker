// #441 item 4 (ADR 0250): a crash preset's label is built from its fall with fmtPct, so
// it reads "−10,0 %" like every other percentage, in the button and the saved name.
import { describe, it, expect } from "vitest";
import { D } from "../../../lib/money";
import { fmtPct } from "../../../lib/format";
import { cs } from "../../../i18n/cs";
import { COMBINED_RECIPES, CRASH_LEVELS, crashPreset } from "../scenarios";

describe("crash preset labels (#441 item 4)", () => {
  it("are the fall as a negative percentage", () => {
    expect(CRASH_LEVELS.map((l) => l.label)).toEqual([
      "−10,0 %",
      "−20,0 %",
      "−35,0 %",
    ]);
    for (const l of [...CRASH_LEVELS, ...COMBINED_RECIPES.map((r) => r.crash)])
      expect(l.label).toBe(fmtPct(D(l.pct).neg()));
  });

  it("name the saved preset in the app's percent format", () => {
    const [ten] = CRASH_LEVELS;
    expect(ten && crashPreset(ten, 0, cs).name).toBe(
      cs.scenarios.crashTitle("−10,0 %", ""),
    );
  });
});
