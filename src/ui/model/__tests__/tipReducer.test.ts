// ADR 0217 §2 (#491): what shows an info tip, as a pure reducer. The component's own
// behaviour stays pinned by src/ui/components/__tests__/InfoTip.test.tsx.
import { describe, it, expect } from "vitest";
import {
  TIP_AT_REST,
  tipOpen,
  tipReducer,
  type TipEvent,
  type TipState,
} from "../infoTip";

const run = (...events: TipEvent[]): TipState =>
  events.reduce(tipReducer, TIP_AT_REST);

describe("tipReducer (ADR 0217 §2)", () => {
  it("is shut at rest; hover or focus shows it", () => {
    expect(tipOpen(TIP_AT_REST)).toBe(false);
    expect(tipOpen(run({ type: "hover", on: true }))).toBe(true);
    expect(tipOpen(run({ type: "focus" }))).toBe(true);
  });

  it("a click while hovered pins it; a second click closes it and keeps it dismissed under the pointer", () => {
    const pinned = run({ type: "hover", on: true }, { type: "click" });
    expect(pinned.pinned).toBe(true);
    const closed = tipReducer(pinned, { type: "click" });
    expect(tipOpen(closed)).toBe(false);
    expect(closed.dismissed).toBe(true);
  });

  it("a click on a tip shown by focus alone (Enter) closes it", () => {
    const s = run({ type: "focus" }, { type: "click" });
    expect(tipOpen(s)).toBe(false);
    expect(s).toEqual({ ...TIP_AT_REST, focused: true, dismissed: true });
  });

  it("a dismissal lasts until both triggers have left, then a new hover shows it", () => {
    const s = run(
      { type: "hover", on: true },
      { type: "focus" },
      { type: "dismiss" },
      { type: "hover", on: false },
    );
    expect(s.dismissed).toBe(true);
    const left = tipReducer(s, { type: "blur", leftTip: true });
    expect(left.dismissed).toBe(false);
    expect(tipOpen(tipReducer(left, { type: "hover", on: true }))).toBe(true);
  });

  it("a dismissal with neither trigger on the tip leaves nothing dismissed", () => {
    const s = run({ type: "click" }, { type: "dismiss" });
    expect(s).toEqual(TIP_AT_REST);
  });

  it("focus leaving the tip unpins it; focus moving inside it does not", () => {
    const pinned = run(
      { type: "focus" },
      { type: "hover", on: true },
      { type: "click" },
    );
    expect(pinned.pinned).toBe(true);
    expect(tipReducer(pinned, { type: "blur", leftTip: false }).pinned).toBe(
      true,
    );
    expect(tipReducer(pinned, { type: "blur", leftTip: true }).pinned).toBe(
      false,
    );
  });
});
