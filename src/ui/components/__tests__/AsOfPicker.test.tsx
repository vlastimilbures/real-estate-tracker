// @vitest-environment jsdom
//
// UX-059 (DR-015, DR-072): the As-of picker keeps the date inside the projection window
// and its presets step like EDATE.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsOfPicker } from "../AsOfPicker";
import { useUiStore } from "../../../state/uiStore";
import { isoDate } from "../../../engine";
import { asOfBounds } from "../../model/asOf";

vi.mock("../../../lib/today", () => ({
  todayUtc: () => new Date(Date.UTC(2028, 1, 29)),
}));

const bounds = asOfBounds(isoDate("2026-06-07"), 30);

beforeEach(() => act(() => useUiStore.setState({ language: "en" })));

describe("AsOfPicker (UX-059)", () => {
  it("a typed date before the base date becomes the base date", async () => {
    const onChange = vi.fn();
    render(<AsOfPicker value={null} onChange={onChange} bounds={bounds} />);
    const input = screen.getByTestId("asof-input");
    await userEvent.clear(input);
    await userEvent.type(input, "01.01.2020{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(bounds.min);
  });

  it("a typed date past the horizon becomes its last day", async () => {
    const onChange = vi.fn();
    render(<AsOfPicker value={null} onChange={onChange} bounds={bounds} />);
    const input = screen.getByTestId("asof-input");
    await userEvent.clear(input);
    await userEvent.type(input, "01.01.2090{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(bounds.max);
  });

  it("+1y from 29 Feb lands on 28 Feb", async () => {
    const onChange = vi.fn();
    render(<AsOfPicker value={null} onChange={onChange} bounds={bounds} />);
    await userEvent.click(screen.getByTestId("asof-1y"));
    const d = onChange.mock.calls[0]![0] as Date;
    expect(d.toISOString().slice(0, 10)).toBe("2029-02-28");
  });
});
