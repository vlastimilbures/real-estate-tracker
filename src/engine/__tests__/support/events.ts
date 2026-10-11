// Loan-event fixture shared by the output-equivalence tests and the golden master (v2,
// ADR 0174).
import { edate } from "../../dates";
import type { Portfolio } from "../../types";
import { money } from "../../brands";

/** Every loan with two prepayments and a recast (ADR 0109; #130 G1-6-04). Javorová's
 *  and the inactive loan's first prepayments replay as history, the dev loan meets its
 *  events after completion, the future loan after its draw. */
export const withEvents = (p: Portfolio): Portfolio => ({
  ...p,
  mortgages: p.mortgages.map((m) => ({
    ...m,
    prepayments: [
      {
        date: edate(m.startDate, 61),
        amount: money("150000"),
        effect: "shortenTerm",
      },
      {
        date: edate(m.startDate, 97),
        amount: money("100000"),
        effect: "lowerInstalment",
        fee: money("2000"),
      },
    ],
    recasts: [
      { date: edate(m.startDate, 121), maturity: edate(m.startDate, 300) },
    ],
  })),
});
