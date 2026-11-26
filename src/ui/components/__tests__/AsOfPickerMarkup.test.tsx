// @vitest-environment jsdom
//
// The As-of picker's markup and preset picks, pinned before its two presets are built
// from one list: Today, +1y and +5y with their pressed states and test ids.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsOfPicker } from "../AsOfPicker";
import { addYears, isoDate } from "../../../engine";
import { asOfBounds } from "../../model/asOf";
import { setClock } from "../../../__tests__/support/clock";
import { todayUtc } from "../../../lib/day";

beforeEach(() => setClock("2027-03-15"));

const bounds = asOfBounds(isoDate("2026-06-07"), 30);

/** Markup with React's generated ids (render-order counters) named alike. */
function html(el: Element): string {
  return el.innerHTML.replace(/«[^»]+»|:r[0-9a-z]+:/g, "«id»");
}

describe("AsOfPicker markup", () => {
  it.each([
    ["today", null],
    ["+1y", 1],
    ["+5y", 5],
    ["another day", 2],
  ] as const)("at %s", (_name, years) => {
    const value = years === null ? null : addYears(todayUtc(), years);
    const { container } = render(
      <AsOfPicker
        value={value}
        onChange={vi.fn()}
        bounds={bounds}
        hint="Values at the year's end"
      />,
    );
    expect(html(container)).toMatchSnapshot();
  });

  it("the presets pick today, then one and five years from today", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AsOfPicker value={null} onChange={onChange} bounds={bounds} />);
    await user.click(screen.getByTestId("asof-1y"));
    await user.click(screen.getByTestId("asof-5y"));
    await user.click(screen.getByTestId("asof-today"));
    expect(onChange.mock.calls).toEqual([
      [addYears(todayUtc(), 1)],
      [addYears(todayUtc(), 5)],
      [null],
    ]);
  });
});
