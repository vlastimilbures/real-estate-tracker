// #472: the frozen upgrade of old backup overrides. Restore runs every scenario through
// `upgradeLegacyOverrides`, so a legacy (unversioned) JSON from a pre-P5a backup becomes
// the v1 JSON the database stores, as the old migration 8 did.
import { describe, expect, it } from "vitest";
import { DataError } from "../errors";
import { upgradeLegacyOverrides } from "../scenarioOverrides";

describe("upgradeLegacyOverrides", () => {
  it.each([
    ["{}", '{"version":1}'],
    ['{"appreciationPa":"0.010"}', '{"version":1,"appreciationPa":"0.01"}'],
    [
      '{"valueShockPct":"-0.25","inflationPa":"0.03"}',
      '{"version":1,"inflationPa":"0.03","valueShock":{"pct":"-0.25","atYear":0}}',
    ],
    [
      '{"valueShock":{"pct":"-0.3"}}',
      '{"version":1,"valueShock":{"pct":"-0.3","atYear":0}}',
    ],
    [
      '{"valueShock":{"pct":"-0.3","atYear":4},"valueShockPct":"-0.1"}',
      '{"version":1,"valueShock":{"pct":"-0.3","atYear":4}}',
    ],
    [
      '{"rateShock":{"durationYears":2,"deltaPa":"0.01"}}',
      '{"version":1,"rateShock":{"deltaPa":"0.01","durationYears":2}}',
    ],
  ])("upgrades the legacy %s to v1", (legacy, v1) => {
    expect(upgradeLegacyOverrides("Old", legacy)).toBe(v1);
  });

  it("keeps a v1 JSON in its canonical form", () => {
    const v1 =
      '{"version":1,"appreciationPa":"0.02","inflationShock":{"deltaPa":"0.01","durationYears":3},"valueShock":{"pct":"-0.2","atYear":5}}';
    expect(upgradeLegacyOverrides("New", v1)).toBe(v1);
  });

  it.each([
    [
      '{"version":1,"valueShockPct":"-0.2"}',
      'scenario "S": overrides has an unknown key "valueShockPct"',
    ],
    [
      '{"version":1,"valueShock":{"pct":"-0.2"}}',
      'scenario "S": overrides valueShock is not {pct, atYear}',
    ],
    ['{"version":2}', 'scenario "S": overrides has unsupported version 2'],
    [
      '{"valueShockPct":-0.2}',
      'scenario "S": overrides valueShockPct is not a decimal string',
    ],
  ])("refuses %s with SCENARIO_INVALID", (json, line) => {
    const error = (() => {
      try {
        upgradeLegacyOverrides("S", json);
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({
      code: "SCENARIO_INVALID",
      message: `A saved scenario cannot be read: ${line}.`,
      details: [line],
    });
  });
});
