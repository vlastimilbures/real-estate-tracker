// The year-on-year equity bridge (ADR 0165, 0170) and the value a year's purchases and
// construction add (ADR 0194), for the equity-change chart, the grid and the Excel export
// (#481). Pure: projection rows in (either lens), Decimals out at full precision.
//
// Equity = value − committed debt, and the drawn balance moves by
// −principal − prepaid + draws + refinanced, so a year's equity change is two economically
// opposite debt movements, principal *repaid* (raises equity) and new debt *drawn* (lowers
// it), besides the value change. Splitting them keeps a development loan's draw years from
// masquerading as repayment.
//
// `draws` is the engine's nominal draws per year deflated by one year factor, so it is
// zero for a year without new debt under either lens. It MUST NOT be backed out of the
// lensed balances: in real terms balance[t] and balance[t−1] carry different deflators,
// and the back-out would leave the inflation erosion of the prior balance as phantom
// drawdown. Appreciation is the residual instead and absorbs that erosion as a value-side
// effect, so the four parts sum *exactly* to equity[t] − equity[t−1]. In the nominal lens
// appreciation is the value change less the purchases.
//
// A future purchase's value enters equity in its turn-on year (`acquiredValue`) and goes to
// the purchases part, out of the appreciation residual. A refinance handover's difference
// (`refinanced`, ADR 0130) moves the balance like a draw, so the new-debt part carries it
// too (negative when the owner pays down at a refix). The parts follow the shown figures,
// drawn debt and value less the undrawn tranches (ADR 0169, 0170): the fall in the undrawn
// tranches, `draws − committedDraws` (zero for a plain loan), goes to purchases as far as
// it is value (`builtValue`), and the rest is a commitment change with no value, e.g. a
// handover into a development loan, which stays in new debt.
import { Decimal } from "../lib/money";
import { at } from "./arrays";
import type { ProjectionYear } from "./types";

type DrawFlows = Pick<
  ProjectionYear,
  "draws" | "committedDraws" | "acquiredValue"
>;

/** What a year's development draws build (ADR 0170): the tranches drawn for
 *  construction, less, in a purchase year, the tranches the bought flat has not drawn
 *  yet. Between −acquiredValue and the year's draws. */
export function builtValue(r: DrawFlows): Decimal {
  const released = r.draws.minus(r.committedDraws);
  return Decimal.min(Decimal.max(released, r.acquiredValue.negated()), r.draws);
}

/** The value purchases and construction add in a year, apart from growth: the
 *  equity-change chart's purchases and the grid's Purchases column (ADR 0194). */
export function purchasedValue(r: DrawFlows): Decimal {
  return r.acquiredValue.plus(builtValue(r));
}

/** The rows the bridge reads: a projection year under either lens. */
export type EquityBridgeInput = Pick<
  ProjectionYear,
  | "year"
  | "calendarYear"
  | "equity"
  | "principal"
  | "prepaid"
  | "refinanced"
  | "draws"
  | "committedDraws"
  | "acquiredValue"
>;

/** One year's equity change in four parts that sum exactly to it. */
export interface EquityBridgeYear {
  year: number;
  calendarYear: number;
  /** The residual: value growth (negative in a crash year) and, in real terms, the
   *  inflation erosion of the debt. */
  appreciation: Decimal;
  /** Value bought in less its undrawn tranches, plus the value drawn into a development. */
  purchases: Decimal;
  /** Principal repaid, prepaid included (≥ 0). */
  paydown: Decimal;
  /** −(new debt drawn, committed or refinanced in the year). */
  drawdown: Decimal;
}

/** Per-year equity change from year 1 (year 0 is the opening position, with no prior
 *  year); empty without a year after the first row. */
export function equityBridge(rows: EquityBridgeInput[]): EquityBridgeYear[] {
  return rows.slice(1).map((r, i) => bridgeYear(r, at(rows, i)));
}

function bridgeYear(
  r: EquityBridgeInput,
  prev: EquityBridgeInput,
): EquityBridgeYear {
  const released = r.draws.minus(r.committedDraws);
  const built = builtValue(r);
  return {
    year: r.year,
    calendarYear: r.calendarYear,
    appreciation: r.equity
      .minus(prev.equity)
      .minus(r.acquiredValue)
      .minus(r.principal)
      .minus(r.prepaid)
      .plus(r.committedDraws)
      .plus(r.refinanced),
    purchases: purchasedValue(r),
    paydown: r.principal.plus(r.prepaid),
    drawdown: r.draws.plus(r.refinanced).minus(released.minus(built)).negated(),
  };
}
