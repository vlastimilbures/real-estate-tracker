// @vitest-environment jsdom
//
// "Today" is read in three places: the page's as-of (useAsOf), the as-of picker and the
// engine call's fallback. This pins what the Dashboard does today, left open at Today
// over midnight: the next render moves the page and the picker to the new day, with no
// focus change or other event. A single store-held "today" refreshed on focus would change
// this, so it is listed for the owner rather than made here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Dashboard } from "../Dashboard";
import { renderWithPortfolio } from "../../../__tests__/support/world";
import { en } from "../../../i18n/en";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

const hint = (day: string) => en.dashboard.monthlyHint(day);

describe("the Dashboard at Today over midnight", () => {
  it("the page and the picker read the same day, before and after midnight", () => {
    vi.setSystemTime(new Date(2026, 9, 2, 23, 59));
    const { container, rerender } = renderWithPortfolio(<Dashboard />, {
      route: "dashboard",
      asOf: null,
    });
    const input = screen.getByTestId<HTMLInputElement>("asof-input");
    expect(input.value).toBe("02.10.2026");
    expect(container.innerHTML).toContain(hint("02.10.2026"));

    vi.setSystemTime(new Date(2026, 9, 3, 0, 1));
    rerender(<Dashboard />);
    expect(input.value).toBe("03.10.2026");
    expect(container.innerHTML).toContain(hint("03.10.2026"));
    expect(container.innerHTML).not.toContain(hint("02.10.2026"));
  });
});
