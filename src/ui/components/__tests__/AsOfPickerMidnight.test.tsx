// @vitest-environment jsdom
//
// ADR 0149 §4 (#119 item 3): the as-of picker follows the day. Left open over midnight
// at Today, its field shows the new day, and a blur does not save yesterday.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AsOfPicker } from "../AsOfPicker";
import { useUiStore } from "../../../state/uiStore";
import { isoDate } from "../../../engine";
import { asOfBounds } from "../../model/asOf";

const bounds = asOfBounds(isoDate("2026-06-07"), 30);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  act(() => useUiStore.setState({ language: "en" }));
});
afterEach(() => vi.useRealTimers());

describe("AsOfPicker over midnight (ADR 0149)", () => {
  it("shows the new day after midnight and a blur keeps Today (#119)", () => {
    const onChange = vi.fn();
    vi.setSystemTime(new Date(2026, 9, 2, 23, 59));
    const { rerender } = render(
      <AsOfPicker value={null} onChange={onChange} bounds={bounds} />,
    );
    const input = screen.getByTestId<HTMLInputElement>("asof-input");
    expect(input.value).toBe("02.10.2026");

    vi.setSystemTime(new Date(2026, 9, 3, 0, 1));
    rerender(<AsOfPicker value={null} onChange={onChange} bounds={bounds} />);
    expect(input.value).toBe("03.10.2026");

    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalledWith(new Date(Date.UTC(2026, 9, 2)));
  });
});
