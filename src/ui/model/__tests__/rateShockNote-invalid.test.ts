// The Scenarios page's reach note on data the engine refuses (ADR 0247 §6, #543): no
// note, so the page shows its invalid-data notice instead of freezing or crashing. Each
// case runs first in a child process (engine support/bounded.ts), since one hung on main.
import { describe, expect, it } from "vitest";
import {
  BOUNDED_TIMEOUT as TIMEOUT,
  bounded,
} from "../../../engine/__tests__/support/bounded";
import {
  invalidNote,
  type RateShockInvalidCase,
} from "./support/rateShockInvalid";

const SUPPORT = new URL("./support/rateShockInvalid.ts", import.meta.url).href;

function expectNoNote(name: RateShockInvalidCase) {
  expect(bounded(SUPPORT, "invalidNote", name)).toBeUndefined();
  expect(invalidNote(name)).toBeUndefined();
}

describe("rateShockNote on invalid data (ADR 0247)", () => {
  it("#543: a recast to an invalid maturity gives no note", TIMEOUT, () =>
    expectNoNote("recastInvalidMaturity"),
  );

  // Before ADR 0247 the invalid block dropped out of the chain and the other loans got
  // a note.
  it("#543: an invalid loan start gives no note", TIMEOUT, () =>
    expectNoNote("invalidStart"),
  );

  it("an invalid base date gives no note", TIMEOUT, () =>
    expectNoNote("invalidBaseDate"),
  );
});
