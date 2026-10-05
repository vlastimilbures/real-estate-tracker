// ADR 0130 (#172 R9-02): a refinance handover's difference — the successor's principal
// less the predecessor balance it pays off — is `refinanced`, apart from `drawn`, which
// holds only real new debt (a loan's draw, a tranche). The row identity becomes
// endBalance = previous − principal − prepaid + drawn + refinanced.
import { describe, it, expect } from "vitest";
import { D, ZERO, type Decimal } from "../../lib/money";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { portfolioProjection } from "../projections";
import { openingDebt, propertySchedule } from "../schedule";
import type { AmortizationRow, MortgageBlock, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { mixedWithRefi } from "./support/synthetic";

const javorova = portfolio.mortgages.filter((m) => m.propertyId === "javorova");

const refi = (
  start: string,
  principal: Decimal | string,
  extra: Partial<MortgageBlock> = {},
): MortgageBlock =>
  ({
    id: "m-refi",
    propertyId: "javorova",
    startDate: isoDate(start),
    initialPrincipal: money(principal),
    fixationYears: 5,
    interestRatePa: rate("0.039"),
    monthlyInstalment: money("9800"),
    ...extra,
  }) as MortgageBlock;

const withRefi = (block: MortgageBlock): Portfolio => ({
  ...portfolio,
  mortgages: [...portfolio.mortgages, block],
});

/** Javorova's chain with a successor; the handover row and the balance paid off. */
function handover(block: MortgageBlock, owner: MortgageBlock[] = javorova) {
  const s = propertySchedule([...owner, block], assumptions);
  const [r] = s.refinances;
  if (!r) throw new Error("expected a handover");
  return { s, r, row: s.rows[r.month - 1]! };
}

/** Max |endBalance − (previous − principal − prepaid + drawn + refinanced)|. */
function identityGap(rows: AmortizationRow[], opening: Decimal): number {
  let prev = opening;
  let gap = 0;
  for (const r of rows) {
    const expected = prev
      .minus(r.principal)
      .minus(r.prepaid)
      .plus(r.drawn)
      .plus(r.refinanced);
    gap = Math.max(gap, r.endBalance.minus(expected).abs().toNumber());
    prev = r.endBalance;
  }
  return gap;
}

// Javorova's payment #56, due 17.01.2031 (its fixation end), leaves 1,386,249.89 Kč; a
// successor starting that day draws in grid month 56 and pays that balance off.
describe("ADR 0130: the refinance difference is apart from draws", () => {
  it("a successor rounded to 1,000 Kč: −249.89 Kč, nothing drawn", () => {
    const { r, row } = handover(refi("2031-01-17", "1386000"));
    expect(r.month).toBe(56);
    expect(row.drawn.toString()).toBe("0");
    expect(row.refinanced.toFixed(2)).toBe("-249.89");
    expect(row.refinanced.toFixed(6)).toBe(r.drawn.minus(r.paidOff).toFixed(6));
  });

  it("a 200,000 Kč paydown at the refix: −200,000 Kč", () => {
    const { r } = handover(refi("2031-01-17", "1386249.89"));
    const { row } = handover(
      refi("2031-01-17", r.paidOff.minus(200000).toString()),
    );
    expect(row.drawn.toString()).toBe("0");
    expect(row.refinanced.toFixed(2)).toBe("-200000.00");
  });

  it("a successor typed to the haléř leaves a sub-haléř difference", () => {
    const { row } = handover(refi("2031-01-17", "1386249.89"));
    expect(row.drawn.toString()).toBe("0");
    expect(row.refinanced.abs().lessThan(0.005)).toBe(true);
  });

  it("is zero in every other row", () => {
    const { s, r } = handover(refi("2031-01-17", "1386000"));
    const others = s.rows.filter((x) => x.month !== r.month);
    expect(others.every((x) => x.refinanced.isZero())).toBe(true);
  });

  it("a tranche the successor draws in the handover month stays drawn", () => {
    const { r, row } = handover(
      refi("2031-01-17", "1386000", {
        loanTermYears: 20,
        completionDate: isoDate("2032-01-17"),
        draws: [{ date: isoDate("2031-01-30"), amount: money("100000") }],
      }),
    );
    expect(row.drawn.toFixed(2)).toBe("100000.00");
    expect(row.refinanced.toFixed(2)).toBe("-249.89");
    expect(r.paidOff.toFixed(2)).toBe("1386249.89");
  });

  it("a predecessor drawn in the handover month is drawn, the rest refinanced", () => {
    // Both future loans start between the grid dates 07.01.2027 and 07.02.2027, so
    // both draw in grid month 8: the first pays off its own draw.
    const owner = refi("2027-01-10", "1000000", { id: "m-new" });
    const next = refi("2027-01-20", "1050000");
    const s = propertySchedule([owner, next], assumptions);
    const [r] = s.refinances;
    const row = s.rows[r!.month - 1]!;
    expect(r!.month).toBe(8);
    expect(row.drawn.toFixed(2)).toBe("1000000.00");
    expect(row.refinanced.toFixed(2)).toBe("50000.00");
    expect(identityGap(s.rows, ZERO)).toBeLessThanOrEqual(1e-9);
  });

  it("a predecessor's tranche in a grid-month-1 handover is drawn", () => {
    // The owner pays on the 15th; its 500,000 Kč tranche (10.06) lands in grid month 1,
    // and so does a successor starting 12.06, before that payment is due: the balance
    // it pays off includes the tranche.
    const owner = refi("2025-01-15", "1000000", {
      id: "m-dev",
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("5400"),
      loanTermYears: 30,
      draws: [{ date: isoDate("2026-06-10"), amount: money("500000") }],
    });
    const blocks = [owner, refi("2026-06-12", "1600000")];
    const s = propertySchedule(blocks, assumptions);
    const [r] = s.refinances;
    const row = s.rows[0]!;
    expect(r!.month).toBe(1);
    expect(row.drawn.toFixed(2)).toBe("500000.00");
    expect(row.refinanced.toFixed(2)).toBe("119837.41");
    // The balance paid off (1,480,162.59 Kč) already holds the tranche.
    expect(row.refinanced.toFixed(6)).toBe(
      r!.drawn.minus(r!.paidOff).toFixed(6),
    );
    expect(
      identityGap(s.rows, openingDebt(blocks, assumptions)),
    ).toBeLessThanOrEqual(1e-9);
  });

  it("a predecessor's tranche in a later handover month whose payment is dropped is drawn", () => {
    // ADR 0138 (#229): grid month 4 is 07.10.2026. The owner's 200,000 Kč tranche
    // (08.09) is dated before the successor's start (09.09), while its payment of that
    // month (15.09) is due after it and dropped: the successor still pays the tranche off.
    const owner = refi("2025-01-15", "1000000", {
      id: "m-dev",
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("5400"),
      loanTermYears: 30,
      completionDate: isoDate("2027-01-15"),
      draws: [{ date: isoDate("2026-09-08"), amount: money("200000") }],
    });
    const blocks = [owner, refi("2026-09-09", "1300000")];
    const s = propertySchedule(blocks, assumptions);
    const [r] = s.refinances;
    const row = s.rows[r!.month - 1]!;
    expect(r!.month).toBe(4);
    expect(r!.paidOff.toFixed(2)).toBe("1200000.00");
    expect(row.drawn.toFixed(2)).toBe("200000.00");
    expect(row.refinanced.toFixed(2)).toBe("100000.00");
    expect(
      identityGap(s.rows, openingDebt(blocks, assumptions)),
    ).toBeLessThanOrEqual(1e-9);
  });

  it("every row reconciles with drawn + refinanced", () => {
    for (const principal of ["1386000", "1186249.89", "1633000"]) {
      const { s } = handover(refi("2031-01-17", principal));
      const opening = openingDebt(javorova, assumptions);
      expect(identityGap(s.rows, opening)).toBeLessThanOrEqual(1e-9);
    }
  });

  it("the projection year carries it apart from draws, and the balance reconciles", () => {
    for (const p of [withRefi(refi("2031-01-17", "1386000")), mixedWithRefi]) {
      const years = portfolioProjection(p, assumptions);
      for (const y of years.slice(1)) {
        const prev = years[y.year - 1]!;
        const expected = prev.balance
          .minus(y.principal)
          .minus(y.prepaid)
          .plus(y.draws)
          .plus(y.refinanced);
        expect(y.balance.minus(expected).abs().toNumber()).toBeLessThan(1e-6);
      }
    }
    const years = portfolioProjection(
      withRefi(refi("2031-01-17", "1386000")),
      assumptions,
    );
    expect(years[5]!.draws.toString()).toBe("0");
    expect(years[5]!.refinanced.toFixed(2)).toBe("-249.89");
    expect(
      years.filter((y) => y.year !== 5).every((y) => y.refinanced.isZero()),
    ).toBe(true);
  });

  // Grid month 1 is 07.07.2026; Javorova's payment #1 of it is due 17.06.2026, so a
  // successor starting 20.06 keeps that payment and one starting 10.06 does not. A start
  // of 10.01.2031 drops payment #56 (due 17.01.2031); a prepayment dated 12.01.2031 is
  // then paid at the handover, before the successor pays off the rest (ADR 0109).
  it.each([
    ["grid month 1, payment kept", "2026-06-20", []],
    ["grid month 1, payment dropped", "2026-06-10", []],
    ["later month, payment dropped", "2031-01-10", []],
    ["prepayment paid at the handover", "2031-01-15", ["2031-01-12"]],
  ])(
    "%s: nothing drawn, refinanced = drawn − paid off",
    (_, start, prepayments) => {
      const owner = javorova.map((b) => ({
        ...b,
        prepayments: prepayments.map((date) => ({
          date: isoDate(date),
          amount: money("100000"),
          effect: "lowerInstalment" as const,
        })),
      }));
      const { s, r, row } = handover(refi(start, "1300000"), owner);
      expect(row.drawn.toString()).toBe("0");
      expect(row.refinanced.toFixed(6)).toBe(
        r.drawn.minus(r.paidOff).toFixed(6),
      );
      if (prepayments.length > 0)
        expect(row.prepaid.toFixed(2)).toBe("100000.00");
      expect(
        identityGap(s.rows, openingDebt(javorova, assumptions)),
      ).toBeLessThanOrEqual(1e-9);
    },
  );

  it("drawn + refinanced is the handover's net new debt (D-47, DR-092)", () => {
    const { r, row } = handover(refi("2031-01-17", "1633000"));
    expect(row.drawn.plus(row.refinanced).toFixed(6)).toBe(
      D(r.drawn).minus(r.paidOff).toFixed(6),
    );
  });
});
