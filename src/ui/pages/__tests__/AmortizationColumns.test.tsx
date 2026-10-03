// @vitest-environment jsdom
//
// ADR 0116 §12: the amortization table shows Drawn, Prepaid and Prepayment fee only when
// some row has a non-zero value, so the balance reconciles on screen.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AmortizationTable } from "../PropertyDetailPanels";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { isoDate, money, propertySchedules } from "../../../engine";
import type { MortgageBlock } from "../../../engine";
import { en } from "../../../i18n/en";

const pd = en.propertyDetail;
const seed = portfolio.mortgages.find((m) => m.propertyId === "javorova")!;
const rowsOf = (b: MortgageBlock) =>
  propertySchedules([b], [b.propertyId], assumptions).get(b.propertyId)!.rows;
const headers = () =>
  screen.getAllByRole("columnheader").map((h) => h.textContent);

describe("ADR 0116: amortization table columns", () => {
  it("has no event columns without events", () => {
    render(<AmortizationTable schedule={rowsOf(seed)} />);
    expect(headers()).not.toContain(pd.amColPrepaid);
    expect(headers()).not.toContain(pd.amColPrepaymentFee);
    expect(headers()).not.toContain(pd.amColDrawn);
  });

  it("shows Prepaid before the end balance, and the fee only when charged", () => {
    const rows = rowsOf({
      ...seed,
      prepayments: [
        {
          date: isoDate("2031-01-17"),
          amount: money(500000),
          effect: "shortenTerm",
        },
      ],
    });
    render(<AmortizationTable schedule={rows} />);
    expect(headers().slice(-2)).toEqual([pd.amColPrepaid, pd.amColEndBalance]);
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toContain("500 000");
  });
});
