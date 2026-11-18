// The Dashboard's fixation timeline on an as-of date that cannot end its ticks loop
// (#543 follow-up, ADR 0247): before the guard, each case never returned. Shared by
// financingTicksGuard.test.ts and the child process it runs each case in first, so a
// case that never returns cannot hang the suite.
import {
  isoDate,
  portfolioOutputs,
  utc,
  type IsoDate,
} from "../../../../engine";
import {
  assumptions,
  portfolio,
} from "../../../../engine/__tests__/support/seed";
import { en } from "../../../../i18n/en";
import { financingTimeline, type ResetWindow } from "../../financing";

const fx = portfolioOutputs(portfolio, assumptions).financing;

const CASES = {
  // An Invalid Date (NaN time): no 1 January is ever after the window's NaN end.
  invalidAsOf: [utc(NaN, 1, 1), "3"],
  invalidIsoAsOf: [isoDate("invalid"), "1"],
  // A valid as-of whose window ends past 13 Sep 275760, the end of the Date range.
  endPastRange: [utc(275759, 1, 1), "3"],
  // A valid window that ends in 275760: the next 1 January is an Invalid Date.
  endInLastYear: [utc(275757, 6, 1), "3"],
} satisfies Record<string, [IsoDate, ResetWindow]>;

export type TicksCase = keyof typeof CASES;

/** The timeline's ticks on one case, or the name and message of what it threw. */
export function ticksOutcome(
  name: TicksCase,
): { label: string; at: number }[] | string {
  const [asOf, span] = CASES[name];
  try {
    return financingTimeline({ ...fx, asOf }, portfolio, span, en).ticks;
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
}
