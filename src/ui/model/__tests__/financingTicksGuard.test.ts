// The timeline's ticks loop always ends (#543 follow-up, ADR 0247). The as-of resolver
// never hands it an invalid date (ADR 0150), but before the guard an invalid as-of, or a
// window at the end of the Date range, never returned. Each case runs first in a child
// process (engine support/bounded.ts); only a case that returned there runs in-process.
import { describe, expect, it } from "vitest";
import {
  BOUNDED_TIMEOUT as TIMEOUT,
  bounded,
} from "../../../engine/__tests__/support/bounded";
import { ticksOutcome, type TicksCase } from "./support/timelineTicks";

const SUPPORT = new URL("./support/timelineTicks.ts", import.meta.url).href;

const REFUSED = "RangeError: financingTimeline: an invalid date";

function expectCase(name: TicksCase, expected: unknown) {
  expect(bounded(SUPPORT, "ticksOutcome", name)).toEqual(expected);
  expect(ticksOutcome(name)).toEqual(expected);
}

describe("financingTimeline on an as-of date that cannot end its ticks", () => {
  it("refuses an Invalid Date as-of", TIMEOUT, () =>
    expectCase("invalidAsOf", REFUSED),
  );

  it("refuses an invalid ISO as-of", TIMEOUT, () =>
    expectCase("invalidIsoAsOf", REFUSED),
  );

  it("refuses a window that ends past the Date range", TIMEOUT, () =>
    expectCase("endPastRange", REFUSED),
  );

  // 275760 is a leap year: the window is 1096 days, its 1 Januaries 214, 579 and 944
  // days after the as-of.
  it("ticks a window that ends in the last year of the range", TIMEOUT, () =>
    expectCase("endInLastYear", [
      { label: "275758", at: expect.closeTo(214 / 1096, 10) },
      { label: "275759", at: expect.closeTo(579 / 1096, 10) },
      { label: "275760", at: expect.closeTo(944 / 1096, 10) },
    ]),
  );
});
