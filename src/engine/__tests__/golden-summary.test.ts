// A readable view of the golden master (golden.test.ts): per fixture, the portfolio KPIs
// and each projection year's key totals, rounded to the parity tolerances (whole Kč for
// money, 4 decimal places for ratios). The hashes there detect any change at full
// precision; this snapshot shows which figure moved and by how much, old → new. It adds
// a view and pins no new target (ADR 0174).
import { describe, it, expect } from "vitest";
import type { Decimal } from "../../lib/money";
import { portfolioProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import type { Assumptions, Portfolio, PortfolioYear } from "../types";
import {
  assumptions as seedAssumptions,
  portfolio as seed,
} from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedCashOutside } from "./support/synthetic";
import { eventsWithRefi } from "./support/events";

/** Whole Kč, thousands grouped by a space; "-0" reads as "0". */
const kc = (d: Decimal): string =>
  d
    .toFixed(0)
    .replace(/^-0$/, "0")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** A ratio, rate or multiple to 4 decimal places; "n/a" when the engine has none. */
const ratio = (d: Decimal | null): string =>
  d === null ? "n/a" : d.toFixed(4);

/** The year totals shown per row, with the width each value is padded to. */
const yearFigures: [string, (y: PortfolioYear) => string, number][] = [
  ["value", (y) => kc(y.value), 11],
  ["debt", (y) => kc(y.balance), 10],
  ["equity", (y) => kc(y.equity), 11],
  ["NOI", (y) => kc(y.noi), 9],
  ["debt service", (y) => kc(y.debtService), 9],
  ["net CF", (y) => kc(y.netCashFlow), 10],
  ["to owner", (y) => kc(y.cashToOwner), 10],
  ["DSCR", (y) => ratio(y.dscr), 6],
];

/** One line per projection year; every value is labelled, so a changed line names it. */
const yearLine = (y: PortfolioYear): string =>
  [
    `${y.calendarYear} y${String(y.year).padEnd(2)}`,
    ...yearFigures.map(([label, f, w]) => `${label} ${f(y).padStart(w)}`),
  ].join(" | ");

/** The KPIs, one labelled line each. */
function kpiLines(portfolio: Portfolio, a: Assumptions): string[] {
  const k = portfolioKpis(portfolio, a);
  const irr = (d: Decimal | null, why: string | null) => why ?? ratio(d);
  const rows: [string, string][] = [
    ["net worth (nominal)", kc(k.netWorthNominal)],
    ["net worth (real)", kc(k.netWorthReal)],
    ["net-worth multiple", ratio(k.netWorthMultiple)],
    ["net-worth multiple (real)", ratio(k.netWorthMultipleReal)],
    ["CAGR (nominal)", ratio(k.cagrNominal)],
    ["CAGR (real)", ratio(k.cagrReal)],
    ["cumulative cash to owner", kc(k.cumulativeNetCashFlow)],
    ["cumulative cash to owner (real)", kc(k.cumulativeNetCashFlowReal)],
    ["first year cash flow positive", String(k.firstCashFlowPositiveYear)],
    ["debt-free year", String(k.debtFreeYear)],
    [
      "levered IRR (nominal)",
      irr(k.leveredIrrNominal, k.leveredIrrNominalReason),
    ],
    ["levered IRR (real)", irr(k.leveredIrrReal, k.leveredIrrRealReason)],
    ["total principal repaid", kc(k.totalPrincipalRepaid)],
    ["total interest", kc(k.totalInterest)],
    ["total interest (real)", kc(k.totalInterestReal)],
  ];
  return rows.map(([label, v]) => `${label.padEnd(32)} ${v}`);
}

/** The rounded summary of one fixture: KPIs, then one line per projection year. */
const summary = (portfolio: Portfolio, a: Assumptions): string =>
  [
    "KPIs",
    ...kpiLines(portfolio, a),
    "years",
    ...portfolioProjection(portfolio, a).map(yearLine),
  ].join("\n");

const fixtures: [string, Portfolio][] = [
  ["seed", seed],
  ["mixed fixture", mixed],
  ["events with a refinance", eventsWithRefi],
  ["cash-outside prepayment on a future buy", mixedCashOutside],
];

describe("golden summary (rounded to the parity tolerances)", () => {
  it.each(fixtures)("%s", (_, portfolio) => {
    expect(summary(portfolio, seedAssumptions)).toMatchSnapshot();
  });
});
