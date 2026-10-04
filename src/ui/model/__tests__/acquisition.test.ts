// ADR 0119 §4, §9 (#33 PR3): the Property detail Acquisition section. Unknown parts read
// "—", no acquisition loan reads "None", and a gap of 1 Kč or more either way warns.
import { describe, it, expect } from "vitest";
import { acquisitionView, cashInvestedTotal } from "../acquisition";
import {
  acquisitionSummary,
  isoDate,
  money,
  type AcquisitionSummary,
  type Property,
} from "../../../engine";
import { D } from "../../../lib/money";
import { fmtCzk } from "../../../lib/format";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";

const d = en.propertyDetail;

/** A summary of a 5 M purchase with a 4 M loan; override what a case needs. */
function summary(over: Partial<AcquisitionSummary> = {}): AcquisitionSummary {
  return {
    price: D(5_000_000),
    loan: D(4_000_000),
    ownCash: D(1_100_000),
    transactionCosts: D(100_000),
    initialWorks: null,
    uses: D(5_100_000),
    sources: D(5_100_000),
    gap: D(0),
    outflow: D(1_100_000),
    ...over,
  };
}

const values = (s: AcquisitionSummary, note?: string) =>
  acquisitionView(s, note, d).rows.map((r) =>
    r.value ? r.value.toString() : r.missing,
  );

describe("acquisitionView", () => {
  it("lists price, costs, works, uses, cash invested, acquisition loan and sources", () => {
    const view = acquisitionView(summary(), undefined, d);
    expect(view.rows.map((r) => r.label)).toEqual([
      d.acqPrice,
      d.acqTransactionCosts,
      d.acqInitialWorks,
      d.acqUses,
      d.acqCashInvested,
      d.acqLoan,
      d.acqSources,
    ]);
    expect(values(summary())).toEqual([
      "5000000",
      "100000",
      "—",
      "5100000",
      "1100000",
      "4000000",
      "5100000",
    ]);
    expect(view.warning).toBeNull();
  });

  it("reads an unknown part as — and no acquisition loan as None", () => {
    expect(
      values(
        summary({
          loan: null,
          transactionCosts: null,
          uses: D(5_000_000),
          sources: D(1_100_000),
          gap: D(3_900_000),
        }),
      ),
    ).toEqual([
      "5000000",
      "—",
      "—",
      "5000000",
      "1100000",
      d.acqLoanNone,
      "1100000",
    ]);
  });

  it("reads sources as — and warns nothing while own cash is unknown", () => {
    const view = acquisitionView(
      summary({ ownCash: null, sources: null, gap: null }),
      undefined,
      d,
    );
    expect(
      values(summary({ ownCash: null, sources: null, gap: null })),
    ).toEqual(["5000000", "100000", "—", "5100000", "—", "4000000", "—"]);
    expect(view.warning).toBeNull();
  });

  it("warns when the recorded sources fall short of the uses", () => {
    expect(
      acquisitionView(summary({ gap: D(25_000) }), undefined, d).warning,
    ).toBe(d.acqGapShort(fmtCzk(25_000)));
  });

  it("says so in other words when the sources exceed the uses", () => {
    expect(
      acquisitionView(summary({ gap: D(-40_000) }), undefined, d).warning,
    ).toBe(d.acqGapOver(fmtCzk(40_000)));
  });

  it("treats a gap under 1 Kč either way as rounding, and warns from exactly 1 Kč", () => {
    for (const gap of ["0.99", "-0.99", "0.4"]) {
      expect(
        acquisitionView(summary({ gap: D(gap) }), undefined, d).warning,
        gap,
      ).toBeNull();
    }
    expect(acquisitionView(summary({ gap: D(1) }), undefined, d).warning).toBe(
      d.acqGapShort(fmtCzk(1)),
    );
    expect(acquisitionView(summary({ gap: D(-1) }), undefined, d).warning).toBe(
      d.acqGapOver(fmtCzk(1)),
    );
  });

  it("keeps own cash 0 as an amount, with no extra hint", () => {
    const view = acquisitionView(
      summary({ ownCash: D(0), sources: D(4_000_000), gap: D(1_100_000) }),
      undefined,
      d,
    );
    expect(view.rows[4]!.value?.toString()).toBe("0");
    expect(view.warning).toBe(d.acqGapShort(fmtCzk(1_100_000)));
  });

  it("carries the recorded note, and no note when blank", () => {
    expect(acquisitionView(summary(), "Deposit", d).note).toBe(
      d.acqRecordedNote("Deposit"),
    );
    expect(acquisitionView(summary(), undefined, d).note).toBeNull();
    expect(acquisitionView(summary(), "  ", d).note).toBeNull();
  });

  it("reads a sample property's engine summary", () => {
    // Lipova: bought 2022-01-15 for 7,225,000 with a 5,610,000 loan from the same day.
    const lipova = portfolio.properties.find((p) => p.id === "lipova")!;
    const s = acquisitionSummary(
      {
        ...lipova,
        funding: {
          ownCash: money("1600000"),
          transactionCosts: money("10000"),
        },
      },
      portfolio,
      assumptions,
    );
    expect(values(s)).toEqual([
      "7225000",
      "10000",
      "—",
      "7235000",
      "1600000",
      "5610000",
      "7210000",
    ]);
    expect(acquisitionView(s, undefined, d).warning).toBe(
      d.acqGapShort(fmtCzk(25_000)),
    );
  });
});

describe("cashInvestedTotal", () => {
  const flat = (id: string, over: Partial<Property> = {}): Property => ({
    id,
    name: id,
    purchaseDate: isoDate("2020-01-01"),
    purchasePrice: money("5000000"),
    ...over,
  });
  const cash = (amount: string) => ({ funding: { ownCash: money(amount) } });

  it("sums the own cash of the active properties", () => {
    expect(
      cashInvestedTotal([
        flat("a", cash("1500000")),
        flat("b", cash("900000.5")),
      ])?.toString(),
    ).toBe("2400000.5");
  });

  it("is not shown while an active property has no own cash", () => {
    expect(
      cashInvestedTotal([
        flat("a", cash("1500000")),
        flat("b", { funding: { transactionCosts: money("95000") } }),
      ]),
    ).toBeNull();
    expect(cashInvestedTotal([flat("a", cash("1")), flat("b")])).toBeNull();
  });

  it("leaves out a deactivated property, known or not", () => {
    expect(
      cashInvestedTotal([
        flat("a", cash("1500000")),
        flat("b", { active: false }),
        flat("c", { active: false, ...cash("700000") }),
      ])?.toString(),
    ).toBe("1500000");
  });

  it("counts a future buy, so one with no own cash hides the total", () => {
    const future = { purchaseDate: isoDate("2030-01-01") };
    expect(
      cashInvestedTotal([
        flat("a", cash("1")),
        flat("b", { ...future, ...cash("2") }),
      ])?.toString(),
    ).toBe("3");
    expect(
      cashInvestedTotal([flat("a", cash("1")), flat("b", future)]),
    ).toBeNull();
  });

  it("counts own cash 0 as known", () => {
    expect(cashInvestedTotal([flat("a", cash("0"))])?.toString()).toBe("0");
  });

  it("is not shown with no active property", () => {
    expect(cashInvestedTotal([])).toBeNull();
    expect(
      cashInvestedTotal([flat("a", { active: false, ...cash("1") })]),
    ).toBeNull();
  });
});
