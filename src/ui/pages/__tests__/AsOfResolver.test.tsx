// @vitest-environment jsdom
//
// ADR 0150 (#113): one as-of resolver. Every page shows the date its numbers are computed
// for, clamped into [baseDate, baseDate + horizon]; Properties uses the same Today basis as
// Property detail and names it; the ownership label follows the same basis.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { Dashboard } from "../Dashboard";
import { Properties } from "../Properties";
import { PropertyDetail } from "../PropertyDetail";
import { usePortfolioStore } from "../../../state/portfolioStore";
import { useUiStore } from "../../../state/uiStore";
import {
  addYears,
  isoDate,
  propertyProjection,
  schedulesByProperty,
  type Assumptions,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { fmtCzk } from "../../../lib/format";

const clock = vi.hoisted(() => ({ today: new Date(Date.UTC(2026, 9, 3)) }));

vi.mock("../../../lib/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/day")>()),
  todayUtc: () => clock.today,
}));
vi.mock("../../../data/errorLog", () => ({ logFailure: vi.fn() }));

class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function setUp(
  p: Portfolio,
  a: Assumptions,
  ui: { asOf?: Date | null; selectedPropertyId?: string | null } = {},
) {
  act(() => {
    usePortfolioStore.setState({
      portfolio: p,
      assumptions: a,
      status: "ready",
    });
    useUiStore.setState({
      language: "en",
      asOf: null,
      selectedPropertyId: null,
      dashboardPropertyIds: [],
      ...ui,
    });
  });
}

const pickerText = () =>
  (screen.getByTestId("asof-input") as HTMLInputElement).value;
const todayPressed = () =>
  screen.getByTestId("asof-today").getAttribute("aria-pressed");
const subtitle = () => document.querySelector(".page-sub")?.textContent ?? "";

beforeEach(() => {
  clock.today = new Date(Date.UTC(2026, 9, 3));
  vi.stubGlobal("IntersectionObserver", NoObserver);
});

afterEach(() => vi.unstubAllGlobals());

describe("the date shown is the date computed (ADR 0150)", () => {
  const futureBase = { ...assumptions, baseDate: isoDate("2027-01-01") };

  it.fails(
    "future base date at Today: the picker and subtitle show the base date, Today is not pressed (#113)",
    () => {
      setUp(portfolio, futureBase);
      render(<Dashboard />);
      expect(pickerText()).toBe("01.01.2027");
      expect(todayPressed()).toBe("false");
      expect(subtitle()).toContain("as of 01.01.2027");
    },
  );

  it.fails(
    "a stored as-of before a moved base date: the picker and Property detail subtitle show the base date (#113)",
    () => {
      setUp(portfolio, futureBase, {
        asOf: isoDate("2026-11-15"),
        selectedPropertyId: "lipova",
      });
      render(<PropertyDetail />);
      expect(pickerText()).toBe("01.01.2027");
      expect(subtitle()).toContain("as of 01.01.2027");
      expect(subtitle()).not.toContain("15.11.2026");
    },
  );

  it.fails(
    "a stored as-of past a lowered horizon: the picker shows the horizon end (#113)",
    () => {
      const short = { ...assumptions, horizonYears: 10 };
      setUp(portfolio, short, { asOf: addYears(assumptions.baseDate, 40) });
      render(<Dashboard />);
      expect(pickerText()).toBe("07.06.2036");
      expect(subtitle()).toContain("as of 07.06.2036");
    },
  );
});

describe("Properties uses the Today basis of Property detail (ADR 0150)", () => {
  it.fails(
    "base date over six months back: the Lipova row is projection year 1, and the subtitle names it (#113)",
    () => {
      clock.today = new Date(Date.UTC(2027, 0, 15));
      setUp(portfolio, assumptions);
      // Property detail at Today shows this row (asOfAnchor.test: a property tile is its
      // projection row for the year).
      const lipova = portfolio.properties.find((p) => p.id === "lipova")!;
      const schedules = schedulesByProperty(
        portfolio.mortgages,
        portfolio.properties.map((p) => p.id),
        assumptions,
      );
      const y1 = propertyProjection(
        lipova,
        portfolio,
        assumptions,
        schedules.get("lipova") ?? [],
      )[1]!;
      render(<Properties />);
      const row = screen
        .getByRole("button", { name: lipova.name })
        .closest("tr")!;
      const cells = within(row).getAllByRole("cell");
      const plain = { parens: false, suffix: false };
      expect(cells[4]!.textContent).toBe(fmtCzk(y1.value, plain));
      expect(cells[5]!.textContent).toBe(fmtCzk(y1.balance, plain));
      expect(subtitle()).toMatch(/projection year Y1 · 2027/);
    },
  );
});

describe("the ownership label follows the basis (ADR 0150)", () => {
  it.fails(
    "Property detail: an as-of that rounds into the purchase year reads purchased (#113)",
    () => {
      // Bought 15.03.2028; 01.01.2028 rounds to projection year 2 (to 07.06.2028), whose
      // tiles hold the loan and the value of the owned flat.
      setUp(mixed, assumptions, {
        asOf: isoDate("2028-01-01"),
        selectedPropertyId: "future",
      });
      render(<PropertyDetail />);
      expect(subtitle()).toContain("purchased 15.03.2028");
      expect(subtitle()).not.toContain("pending");
    },
  );

  it.fails(
    "Properties: no Pending badge once Today's projection year holds the purchase (#113)",
    () => {
      clock.today = new Date(Date.UTC(2028, 0, 1));
      setUp(mixed, assumptions);
      render(<Properties />);
      const row = screen
        .getByRole("button", { name: "Future buy" })
        .closest("tr")!;
      expect(within(row).queryByText("Pending")).toBeNull();
    },
  );
});
