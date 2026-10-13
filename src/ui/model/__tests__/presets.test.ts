// #170: the stress-preset catalogue (ADR 0093, 0101, 0104) lives in the model. Each
// preset keeps the name it is found by and the overrides it saves.
import { describe, it, expect } from "vitest";
import { en } from "../../../i18n/en";
import type { ScenarioOverrides } from "../../../engine";
import {
  COMBINED_RECIPES,
  CRASH_LEVELS,
  INFLATION_LEVELS_PP,
  RATE_LEVELS_PP,
  combinedPreset,
  crashPreset,
  inflationPreset,
  ratePreset,
  type Preset,
} from "../scenarios";

/** Overrides as plain text, so a delta built from pp compares with its written value. */
const plain = (o: ScenarioOverrides) =>
  JSON.parse(JSON.stringify(o)) as unknown;
const named = (p: Preset) => ({ name: p.name, overrides: plain(p.overrides) });
const shock = (deltaPa: string) => ({ deltaPa, durationYears: 3 });

describe("stress presets", () => {
  it("rate and inflation shocks: +pp for the default 3 years", () => {
    expect(RATE_LEVELS_PP.map((pp) => named(ratePreset(pp, en)))).toEqual(
      ["0.02", "0.04", "0.06"].map((d, i) => ({
        name: en.scenarios.rateForYears(
          en.scenarios.plusPp(RATE_LEVELS_PP[i] ?? 0),
          3,
        ),
        overrides: { rateShock: shock(d) },
      })),
    );
    expect(
      INFLATION_LEVELS_PP.map((pp) => named(inflationPreset(pp, en))),
    ).toEqual(
      ["0.03", "0.06", "0.09"].map((d, i) => ({
        name: en.scenarios.inflForYears(
          en.scenarios.plusPp(INFLATION_LEVELS_PP[i] ?? 0),
          3,
        ),
        overrides: { inflationShock: shock(d) },
      })),
    );
  });

  it("price crashes take the When timing in the name and the overrides", () => {
    expect(CRASH_LEVELS.map((l) => named(crashPreset(l, 0, en)))).toEqual([
      {
        name: en.scenarios.crashTitle("−10%", ""),
        overrides: { valueShock: { pct: "0.1", atYear: 0 } },
      },
      {
        name: en.scenarios.crashTitle("−20%", ""),
        overrides: { valueShock: { pct: "0.2", atYear: 0 } },
      },
      {
        name: en.scenarios.crashTitle("−35%", ""),
        overrides: { valueShock: { pct: "0.35", atYear: 0 } },
      },
    ]);
    const later = crashPreset({ label: "−20%", pct: "0.2" }, 5, en);
    expect(later.name).toBe(
      en.scenarios.crashTitle(
        "−20%",
        en.scenarios.crashAt(en.common.plusYears(5)),
      ),
    );
  });

  it("combined presets join the single presets' names and overrides", () => {
    const [mild, severe] = COMBINED_RECIPES.map((r) =>
      named(combinedPreset(r, 10, en)),
    );
    const at10 = en.scenarios.crashAt(en.common.plusYears(10));
    expect(mild).toEqual({
      name: en.scenarios.combinedTitle(
        en.scenarios.mild,
        [
          en.scenarios.rateForYears(en.scenarios.plusPp(2), 3),
          en.scenarios.crashTitle("−10%", at10),
        ].join(" · "),
      ),
      overrides: {
        rateShock: shock("0.02"),
        valueShock: { pct: "0.1", atYear: 10 },
      },
    });
    expect(severe).toEqual({
      name: en.scenarios.combinedTitle(
        en.scenarios.severe,
        [
          en.scenarios.rateForYears(en.scenarios.plusPp(4), 3),
          en.scenarios.inflForYears(en.scenarios.plusPp(3), 3),
          en.scenarios.crashTitle("−20%", at10),
        ].join(" · "),
      ),
      overrides: {
        rateShock: shock("0.04"),
        inflationShock: shock("0.03"),
        valueShock: { pct: "0.2", atYear: 10 },
      },
    });
  });
});
