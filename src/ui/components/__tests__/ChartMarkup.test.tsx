// @vitest-environment jsdom
//
// The chart card's markup, pinned before ChartBody splits by shape (#492): each shape's
// tooltip as rendered for a hovered year, the props each hands to Recharts' Tooltip, the
// legend, and the whole card's SVG. Also the signed shape's two quirks, kept as they are:
// it plots only the first series, and with no series it draws a bar of no key.
import {
  describe,
  it,
  expect,
  afterAll,
  beforeAll,
  beforeEach,
  vi,
} from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChartCard } from "../charts";
import { SERIES } from "../../model/chartData";
import { D } from "../../../lib/money";
import type { ResetMarker } from "../../model/financing";
import { stubResizeObserver } from "../../../__tests__/support/dom";

type Payload = {
  dataKey: string;
  value: number | null;
  color: string;
  payload?: Record<string, unknown>;
};
type TooltipProps = {
  content?: (p: {
    active: boolean;
    label: number;
    payload: Payload[];
  }) => ReactElement;
  [prop: string]: unknown;
};
const tooltips: TooltipProps[] = [];

vi.mock("recharts", async (importOriginal) => {
  const real = await importOriginal<typeof import("recharts")>();
  return {
    ...real,
    Tooltip: (props: TooltipProps) => {
      tooltips.push(props);
      return null;
    },
  };
});

const realRect = HTMLElement.prototype.getBoundingClientRect;
const realMatchMedia = window.matchMedia;
beforeAll(() => {
  // Recharts draws nothing without a measured box; jsdom has none.
  stubResizeObserver();
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      width: 480,
      height: 196,
      top: 0,
      left: 0,
      right: 480,
      bottom: 196,
    }) as DOMRect;
  // Reduce motion: no entry animation, so the SVG is its final state.
  window.matchMedia = ((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  window.matchMedia = realMatchMedia;
});
beforeEach(() => {
  tooltips.length = 0;
});

/** Markup with the ids React and Recharts generate (render-order counters) named alike. */
function html(el: Element): string {
  return el.innerHTML
    .replace(/«[^»]+»|:r[0-9a-z]+:/g, "«id»")
    .replace(/recharts\d+-clip/g, "recharts«n»-clip");
}

/** The props the card handed to Recharts' Tooltip, without its content function. */
function tooltipProps(): Record<string, unknown> {
  const { content, ...rest } = tooltips.at(-1) ?? {};
  expect(typeof content).toBe("function");
  return rest;
}

/** The tooltip for one hovered year, rendered. */
function hover(payload: Payload[]): string {
  const content = tooltips.at(-1)?.content;
  if (!content) throw new Error("no tooltip content");
  return html(
    render(content({ active: true, label: 2028, payload })).container,
  );
}

const point = { year: 2, calendarYear: 2028 };
const rows = [2026, 2027, 2028].map((calendarYear, year) => ({
  year,
  calendarYear,
  value: 5_000_000 + year * 100_000,
  debt: 3_000_000 - year * 200_000,
  ltv: year === 0 ? null : 0.6 - year * 0.05,
  up: 30_000 * year,
  down: -10_000 * year,
  net: year === 1 ? -20_000 : 50_000,
}));
const markers: ResetMarker[] = [
  {
    calendarYear: 2028,
    resets: [
      {
        id: "m-lipova",
        name: "Byt Lipova",
        date: "15.01.2028",
        balance: D("4772578"),
      },
    ],
  },
];
const lineSeries = [
  { key: "value", name: "Value", color: "red" },
  { key: "debt", name: "Debt", color: "blue", dash: "6 3" },
];

function card(el: ReactElement) {
  const { container } = render(el);
  return container.querySelector(".chart-card")!;
}

describe("lines", () => {
  it("pins the card, the legend with its marker, and the tooltip with resets", () => {
    const c = card(
      <ChartCard
        title="Value"
        kind="czk"
        rows={rows}
        series={lineSeries}
        shape={{ type: "lines", markers, markerHeading: "Fixation ends" }}
      />,
    );
    expect(html(c)).toMatchSnapshot();
    expect(html(c.querySelector(".legend")!)).toMatchInlineSnapshot(
      `"<span><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="red" stroke-width="3"></line></svg> Value</span><span><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="blue" stroke-width="3" stroke-dasharray="6 3"></line></svg> Debt</span><span><svg class="series-swatch" width="16" height="10" aria-hidden="true" focusable="false"><line x1="8" y1="0" x2="8" y2="10" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="3 3"></line><path d="M 8 1 L 11 4 L 8 7 L 5 4 Z" fill="var(--ink-soft)"></path></svg> Rate reset</span>"`,
    );
    expect(tooltipProps()).toMatchInlineSnapshot(`{}`);
    expect(
      hover([
        { dataKey: "value", value: 5_200_000, color: "red", payload: point },
        { dataKey: "debt", value: 2_600_000, color: "blue", payload: point },
      ]),
    ).toMatchInlineSnapshot(
      `"<div class="chart-tooltip"><div class="tt-year">Y2 · 2028</div><div class="tt-row"><span class="tt-label"><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="red" stroke-width="3"></line></svg>Value</span><span>5 200 000 Kč</span></div><div class="tt-row"><span class="tt-label"><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="blue" stroke-width="3" stroke-dasharray="6 3"></line></svg>Debt</span><span>2 600 000 Kč</span></div><div class="tt-resets"><div class="tt-label"><svg class="series-swatch" width="16" height="10" aria-hidden="true" focusable="false"><line x1="8" y1="0" x2="8" y2="10" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="3 3"></line><path d="M 8 1 L 11 4 L 8 7 L 5 4 Z" fill="var(--ink-soft)"></path></svg>Fixation ends</div><div class="tt-row tt-reset"><span>Byt Lipova · 15.01.2028</span><span>4 772 578 Kč</span></div></div></div>"`,
    );
  });

  it("a percent line keeps a null in its tooltip and reads it n/a", () => {
    card(
      <ChartCard
        title="LTV"
        kind="pct"
        rows={rows}
        series={[{ key: "ltv", name: "LTV", color: "green" }]}
      />,
    );
    expect(tooltipProps()).toMatchInlineSnapshot(`
      {
        "filterNull": false,
      }
    `);
    expect(
      hover([{ dataKey: "ltv", value: null, color: "green", payload: point }]),
    ).toMatchInlineSnapshot(
      `"<div class="chart-tooltip"><div class="tt-year">Y2 · 2028</div><div class="tt-row"><span class="tt-label"><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="green" stroke-width="3"></line></svg>LTV</span><span>n/a</span></div></div>"`,
    );
  });

  it("one series and no markers: no legend", () => {
    const c = card(
      <ChartCard
        title="Value"
        kind="czk"
        rows={rows}
        series={[lineSeries[0]!]}
      />,
    );
    expect(c.querySelector(".legend")).toBeNull();
  });
});

describe("stacked", () => {
  const series = [
    { key: "up", name: "Appreciation", color: "red" },
    { key: "down", name: "New debt", color: "blue" },
  ];

  it("pins the card, the legend and the tooltip with its total", () => {
    const c = card(
      <ChartCard
        title="Equity change"
        kind="czk"
        shape={{ type: "stacked", totalLabel: "Net change" }}
        rows={rows}
        series={series}
      />,
    );
    expect(html(c)).toMatchSnapshot();
    expect(html(c.querySelector(".legend")!)).toMatchInlineSnapshot(
      `"<span><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="red" stroke-width="3"></line></svg> Appreciation</span><span><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="blue" stroke-width="3"></line></svg> New debt</span>"`,
    );
    expect(tooltipProps()).toMatchInlineSnapshot(`{}`);
    expect(
      hover([
        { dataKey: "up", value: 60_000, color: "red", payload: point },
        { dataKey: "down", value: -20_000, color: "blue", payload: point },
      ]),
    ).toMatchInlineSnapshot(
      `"<div class="chart-tooltip"><div class="tt-year">Y2 · 2028</div><div class="tt-row"><span class="tt-label"><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="red" stroke-width="3"></line></svg>Appreciation</span><span>60 000 Kč</span></div><div class="tt-row"><span class="tt-label"><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="blue" stroke-width="3"></line></svg>New debt</span><span>(20 000 Kč)</span></div><div class="tt-row tt-total"><span>Net change</span><span>40 000 Kč</span></div></div>"`,
    );
  });

  it("without a total label the tooltip has no total row", () => {
    card(
      <ChartCard
        title="Equity change"
        kind="czk"
        shape={{ type: "stacked" }}
        rows={rows}
        series={series}
      />,
    );
    expect(
      hover([{ dataKey: "up", value: 60_000, color: "red", payload: point }]),
    ).not.toContain("tt-total");
  });
});

describe("signed", () => {
  const net = { key: "net", name: "Net cash flow", color: SERIES.positive };

  it("pins the card and the tooltip, coloured by the value's sign", () => {
    const c = card(
      <ChartCard
        title="Cash"
        kind="czk"
        shape={{ type: "signed" }}
        rows={rows}
        series={[net]}
      />,
    );
    expect(html(c)).toMatchSnapshot();
    expect(tooltipProps()).toMatchInlineSnapshot(`{}`);
    expect(
      hover([{ dataKey: "net", value: -20_000, color: "x", payload: point }]),
    ).toMatchInlineSnapshot(
      `"<div class="chart-tooltip"><div class="tt-year">Y2 · 2028</div><div class="tt-row"><span class="tt-label"><svg class="series-swatch" width="16" height="4" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="16" y2="2" stroke="var(--negative)" stroke-width="3"></line></svg>Net cash flow</span><span>(20 000 Kč)</span></div></div>"`,
    );
  });

  it("plots only the first series; the others are only in the legend", () => {
    const c = card(
      <ChartCard
        title="Cash"
        kind="czk"
        shape={{ type: "signed" }}
        rows={rows}
        series={[net, { key: "value", name: "Value", color: "red" }]}
      />,
    );
    const fills = [...c.querySelectorAll(".recharts-bar-rectangle path")].map(
      (p) => p.getAttribute("fill"),
    );
    // One bar per year, coloured by the first series' sign: net is negative in 2027.
    expect(fills).toEqual([SERIES.positive, SERIES.negative, SERIES.positive]);
    expect(c.querySelector(".legend")?.textContent).toContain("Value");
  });

  it("with no series it still draws one bar, of no key and no name", () => {
    const c = card(
      <ChartCard
        title="Cash"
        kind="czk"
        shape={{ type: "signed" }}
        rows={rows}
        series={[]}
      />,
    );
    expect(html(c)).toMatchSnapshot();
    expect(tooltipProps()).toMatchInlineSnapshot(`{}`);
  });
});
