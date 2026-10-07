// DR-072: the UI clock takes an injectable "now" and resolves the local calendar day to
// UTC midnight (the engine's date convention). The fixtures sit near local midnight
// (00:30 and 23:30): there the local day and the UTC day differ, in one direction under
// a positive offset (CI: Pacific/Kiritimati) and in the other under a negative one
// (CI: Pacific/Pago_Pago), so a UTC-day regression fails in one of the two (#119).
import { describe, it, expect } from "vitest";
import { isoDay, localDay, localIsoDay, localMidnight, todayUtc } from "../day";

describe("todayUtc", () => {
  it("is the local calendar day of `now` at UTC midnight", () => {
    const late = new Date(2026, 9, 1, 23, 30); // 1 Oct 2026, 23:30 local
    expect(todayUtc(late).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const early = new Date(2026, 9, 1, 0, 30); // 1 Oct 2026, 00:30 local
    expect(todayUtc(early).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("localIsoDay", () => {
  it("is the local calendar day, zero-padded", () => {
    expect(localIsoDay(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
    expect(localIsoDay(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("localDay and localMidnight (ADR 0149)", () => {
  it("are inverses near local midnight", () => {
    for (const [h, m] of [
      [0, 30],
      [23, 30],
    ] as const) {
      const instant = new Date(2026, 9, 3, h, m);
      const day = localDay(instant);
      expect(day.toISOString()).toBe("2026-10-03T00:00:00.000Z");
      expect(localMidnight(day)).toEqual(new Date(2026, 9, 3));
    }
  });
});

describe("isoDay", () => {
  it("is the UTC-midnight day as YYYY-MM-DD, zero-padded", () => {
    expect(isoDay(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01-05");
  });
});

// ADR 0149 §5: the lib twin of the engine's full-year constructor. Date.UTC and the
// local Date constructor map years 0–99 to 1900–1999.
describe("the full year", () => {
  it.fails("localDay keeps years 0–99 (#119)", () => {
    const instant = new Date(2026, 5, 1, 12);
    instant.setFullYear(50);
    expect(localDay(instant).getUTCFullYear()).toBe(50);
  });
  it.fails("localMidnight keeps years 0–99 (#119)", () => {
    const day = new Date(0);
    day.setUTCFullYear(99, 2, 1);
    expect(localMidnight(day).getFullYear()).toBe(99);
  });
});
