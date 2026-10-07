// ADR 0149 §5: localMidnight builds the local day with the full year. In Atlantic/Azores
// the epoch is 23:00 local, and some historical spring-forward gaps skip 23:00–24:00, so
// setting the date before the time rolled into the next day (review of #262).
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { localMidnight } from "../day";

const before = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Atlantic/Azores";
});
afterAll(() => {
  if (before === undefined) delete process.env.TZ;
  else process.env.TZ = before;
});

describe("localMidnight in Atlantic/Azores", () => {
  it("keeps the day on a spring-forward day with a 23:00 gap (#119)", () => {
    const day = new Date(Date.UTC(1924, 3, 16));
    const local = localMidnight(day);
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([
      1924, 3, 16,
    ]);
  });

  it("matches the local Date constructor for every day of 1916–1946 (#119)", () => {
    const misses: string[] = [];
    for (let t = Date.UTC(1916, 0, 1); t < Date.UTC(1947, 0, 1); t += 864e5) {
      const day = new Date(t);
      const y = day.getUTCFullYear();
      const m = day.getUTCMonth();
      const d = day.getUTCDate();
      if (localMidnight(day).getTime() !== new Date(y, m, d).getTime())
        misses.push(`${y}-${m + 1}-${d}`);
    }
    expect(misses).toEqual([]);
  });
});
