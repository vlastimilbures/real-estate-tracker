// ADR 0116 §9: interest saved by prepayments — the chain's interest from grid month 1 to
// payoff with every prepayment removed, minus the same with them. Recasts stay.
import { describe, it, expect } from "vitest";
import { D } from "../../lib/money";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { financingExposure, prepaymentInterestSaved } from "../financing";
import { propertySchedule, propertySchedules } from "../schedule";
import type {
  AmortizationRow,
  MortgageBlock,
  MortgagePrepayment,
  PrepaymentEffect,
} from "../types";
import { annuityPayment } from "./reference/mortgageReference";
import { assumptions, portfolio } from "./support/seed";

const seedJavorova = portfolio.mortgages.find(
  (m) => m.propertyId === "javorova",
);
if (!seedJavorova) throw new Error("seed block missing");
const javorova: MortgageBlock = seedJavorova;

const prepay = (
  date: string,
  amount: number,
  effect: PrepaymentEffect = "lowerInstalment",
): MortgagePrepayment => ({
  date: isoDate(date),
  amount: money(amount),
  effect,
});
const interest = (rows: AmortizationRow[]) =>
  rows.reduce((s, r) => s.plus(r.interest), D(0));
const saved = (blocks: MortgageBlock[]) =>
  prepaymentInterestSaved(
    blocks,
    assumptions,
    propertySchedule(blocks, assumptions),
  );

describe("ADR 0116: interest saved by prepayments", () => {
  it("is null without a prepayment", () => {
    expect(saved([javorova])).toBeNull();
    expect(
      saved([
        {
          ...javorova,
          recasts: [
            { date: isoDate("2031-01-17"), maturity: isoDate("2045-01-17") },
          ],
        },
      ]),
    ).toBeNull();
  });

  it("is the whole-life interest difference", () => {
    // Both schedules match through payment #120 (the fixation end, 2031-01-17). From
    // #121 both are 244-payment annuities at 4.5 %/12 to the same maturity (#364), on
    // balances B and B − 500,000. So the saving is 244 · PMT(500,000) − 500,000, for any B.
    const b = { ...javorova, prepayments: [prepay("2031-01-17", 500000)] };
    const closedForm = annuityPayment("0.00375", 244, 500000)
      .times(244)
      .minus(500000);
    expect(closedForm.toFixed(2)).toBe("264031.42");
    const gap = saved([b])?.minus(closedForm.toString()).abs().toNumber();
    expect(gap).toBeLessThanOrEqual(1e-6);
  });

  it("keeps recasts on both sides", () => {
    const recasts = [
      { date: isoDate("2033-01-17"), maturity: isoDate("2048-01-17") },
    ];
    const b = {
      ...javorova,
      recasts,
      prepayments: [prepay("2031-01-17", 500000)],
    };
    const base = interest(
      propertySchedule([{ ...javorova, recasts }], assumptions).rows,
    );
    const withIt = interest(propertySchedule([b], assumptions).rows);
    expect(saved([b])?.toFixed(6)).toBe(base.minus(withIt).toFixed(6));
  });

  it("counts a prepayment made before baseDate", () => {
    const b = { ...javorova, prepayments: [prepay("2024-01-20", 200000)] };
    expect(saved([b])?.greaterThan(0)).toBe(true);
  });

  it("saves more when the term shortens than when the instalment falls", () => {
    const lower = saved([
      { ...javorova, prepayments: [prepay("2031-01-17", 500000)] },
    ]);
    const shorter = saved([
      {
        ...javorova,
        prepayments: [prepay("2031-01-17", 500000, "shortenTerm")],
      },
    ]);
    expect(shorter?.greaterThan(lower ?? D(0))).toBe(true);
  });

  it("leaves a successor's own interest alone", () => {
    const refi = {
      id: "refi",
      propertyId: javorova.propertyId,
      startDate: isoDate("2036-01-17"),
      initialPrincipal: money(900000),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money(9800),
    } as MortgageBlock;
    const b = { ...javorova, prepayments: [prepay("2031-01-17", 500000)] };
    const plain = propertySchedule([javorova, refi], assumptions);
    const withIt = propertySchedule([b, refi], assumptions);
    const d = withIt.refinances[0].month;
    expect(interest(withIt.rows.slice(d)).toFixed(6)).toBe(
      interest(plain.rows.slice(d)).toFixed(6),
    );
    expect(saved([b, refi])?.toFixed(6)).toBe(
      interest(plain.rows).minus(interest(withIt.rows)).toFixed(6),
    );
  });

  it("is on the property's loan exposure", () => {
    const p = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m === javorova
          ? { ...m, prepayments: [prepay("2031-01-17", 500000)] }
          : m,
      ),
    };
    const ids = p.properties.map((x) => x.id);
    const fx = financingExposure(
      p,
      assumptions,
      propertySchedules(p.mortgages, ids, assumptions),
      assumptions.baseDate,
    );
    const byId = new Map(fx.loans.map((l) => [l.propertyId, l]));
    expect(byId.get("javorova")?.interestSaved?.greaterThan(0)).toBe(true);
    expect(byId.get("lipova")?.interestSaved).toBeNull();
  });
});
