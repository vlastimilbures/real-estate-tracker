// DR-072: the UI clock takes an injectable "now" and resolves the local calendar day to
// UTC midnight (the engine's date convention). The fixtures sit near local midnight
// (00:30 and 23:30): there the local day and the UTC day differ, in one direction under
// a positive offset (CI: Pacific/Kiritimati) and in the other under a negative one
// (CI: Pacific/Pago_Pago), so a UTC-day regression fails in one of the two (#119).
import { describe, it, expect } from "vitest";
import { localIsoDay, todayUtc } from "../today";

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
