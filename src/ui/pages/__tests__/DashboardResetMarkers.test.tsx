// @vitest-environment jsdom
//
// ADR 0210 §2 (#382): the Dashboard's value chart marks the fixation ends of the
// properties in its filter.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { act, render } from "@testing-library/react";
import { Dashboard } from "../Dashboard";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeAll(() => {
  // Recharts needs a measured box to draw; jsdom has none.
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      width: 480,
      height: 196,
      top: 0,
      left: 0,
      right: 480,
      bottom: 196,
    }) as DOMRect;
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoObserver);
  // eslint-disable-next-line no-restricted-syntax -- restored with IntersectionObserver by unstubAllGlobals in afterAll
  vi.stubGlobal("ResizeObserver", NoObserver);
});

function renderWith(ids: string[]) {
  act(() => {
    usePortfolioStore.setState({
      portfolio,
      assumptions,
      status: { kind: "ready" },
    });
    useUiStore.setState({
      language: "en",
      route: "dashboard",
      mode: "nominal",
      asOf: null,
      dashboardPropertyIds: ids,
    });
  });
  return render(<Dashboard />);
}

const heroMarkers = (c: HTMLElement) =>
  c.querySelectorAll(".recharts-reference-line.reset-marker").length;

describe("Dashboard reset markers follow the filter (ADR 0210 §2)", () => {
  it("the whole portfolio: 2029 and 2031", () => {
    const { container } = renderWith([]);
    expect(heroMarkers(container)).toBe(2);
    expect(container.textContent).toContain(en.charts.rateReset);
  });

  it("Byt Lipova alone: its one reset", () => {
    const { container } = renderWith(["lipova"]);
    expect(heroMarkers(container)).toBe(1);
  });
});
