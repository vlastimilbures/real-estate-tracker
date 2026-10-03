// DR-072: the UI clock takes an injectable "now" and resolves the local calendar day to
// UTC midnight (the engine's date convention).
import { describe, it, expect } from "vitest";
import { localIsoDay, todayUtc } from "../today";

describe("todayUtc", () => {
  it("is the local calendar day of `now` at UTC midnight", () => {
    const now = new Date(2026, 9, 1, 23, 30); // 1 Oct 2026, 23:30 local
    expect(todayUtc(now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("localIsoDay", () => {
  it("is the local calendar day, zero-padded", () => {
    expect(localIsoDay(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});
