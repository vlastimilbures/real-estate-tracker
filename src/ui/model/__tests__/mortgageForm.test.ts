// Mortgage form instalment hints (pure). The loan rules themselves (development loan
// needs a term, draws after the start) are the engine's, checked by the store before a
// save: portfolioStore.test.ts "checks engine input rules before writing (UX-047)".
import { describe, it, expect } from "vitest";
import {
  suggestedInstalmentHint,
  instalmentFill,
  mortgageFromForm,
  loanTypeOf,
} from "../mortgageForm";
import { writeRows } from "../loanEventRows";
import { isoDate, money, rate } from "../../../engine";
import { getDict } from "../../../i18n";

const en = getDict("en");

// The live instalment hint and the inline "Calc" fill. English wording is unchanged by
// the DR-059 translation; Czech and Russian now get their own.
describe("suggestedInstalmentHint / instalmentFill", () => {
  const plain = { initialPrincipal: "3 000 000", interestRatePa: "4,5" };

  it("derives a ceil-rounded 30-year instalment when the term is blank", () => {
    expect(suggestedInstalmentHint(en, plain)).toBe(
      "Amortizing instalment over 30 yrs ≈ 15 201 Kč",
    );
    expect(instalmentFill(en, plain)).toEqual({
      label: "Calc",
      title: "Calculate instalment over 30 yrs",
      patch: { monthlyInstalment: "15201" },
    });
  });

  it("uses an explicit term", () => {
    expect(
      suggestedInstalmentHint(en, { ...plain, loanTermYears: "20" }),
    ).toMatch(/^Amortizing instalment over 20 yrs ≈ /);
  });

  it("is silent (no hint, no patch) until principal and rate are valid", () => {
    expect(
      suggestedInstalmentHint(en, { initialPrincipal: "3 000 000" }),
    ).toBeNull();
    expect(
      suggestedInstalmentHint(en, { ...plain, initialPrincipal: "0" }),
    ).toBeNull();
    expect(
      suggestedInstalmentHint(en, { ...plain, loanTermYears: "0" }),
    ).toBeNull();
    const fill = instalmentFill(en, { initialPrincipal: "abc" });
    expect(fill.patch).toBeUndefined();
    expect(fill.title).toBe("Enter principal and interest rate first");
  });

  it("development drafts get the term-required wording", () => {
    const dev = {
      ...plain,
      draws: writeRows([{ date: "01.09.2027", amount: "500000" }]),
    };
    expect(suggestedInstalmentHint(en, dev)).toMatch(
      /— for the initial principal; re-amortizes at each draw and at completion\. Loan term is required\.$/,
    );
    expect(suggestedInstalmentHint(en, { completionDate: "01.01.2028" })).toBe(
      "Development loan — set an explicit loan term (years); it is required for draws / interest-only.",
    );
  });
});

describe("loan type from the draft (ADR 0098, ADR 0167)", () => {
  it("only a tranche row worth saving or a completion date makes it Development", () => {
    expect(loanTypeOf({ draws: "" })).toBe("standard");
    expect(loanTypeOf({ draws: writeRows([{ date: "", amount: "" }]) })).toBe(
      "standard",
    );
    expect(
      loanTypeOf({ draws: writeRows([{ date: "01.09.2027", amount: "" }]) }),
    ).toBe("development");
    expect(loanTypeOf({ completionDate: "31.03.2028" })).toBe("development");
  });
});

describe("mortgage form hints in cs / ru (DR-059)", () => {
  const plain = { initialPrincipal: "3 000 000", interestRatePa: "4,5" };
  it("translates the hint and the Calc button", () => {
    const cs = getDict("cs");
    const ru = getDict("ru");
    expect(suggestedInstalmentHint(cs, plain)).toBe(
      "Anuitní splátka na 30 let ≈ 15 201 Kč",
    );
    expect(instalmentFill(cs, plain).label).toBe("Spočítat");
    expect(suggestedInstalmentHint(ru, plain)).toBe(
      "Аннуитетный платёж на 30 лет ≈ 15 201 Kč",
    );
    expect(instalmentFill(ru, { initialPrincipal: "abc" }).title).toBe(
      ru.propertyDetail.calcDisabled,
    );
  });
});

describe("mortgageFromForm (DR-129)", () => {
  const values = {
    startDate: isoDate("2030-01-01"),
    initialPrincipal: money("2000000"),
    fixationYears: 5,
    loanTermYears: null,
    interestRatePa: rate("0.05"),
    monthlyInstalment: money("12000"),
    draws: [],
    completionDate: null,
  };

  it("keeps a stored contract maturity the form does not show", () => {
    const maturity = isoDate("2055-01-01");
    const m = mortgageFromForm(values, "m1", "p1", {
      contractMaturityDate: maturity,
    });
    expect(m.contractMaturityDate).toBe(maturity);
    expect(m).toMatchObject({ id: "m1", propertyId: "p1", fixationYears: 5 });
    expect(m.loanTermYears).toBeUndefined();
    expect(m.draws).toBeUndefined();
  });

  it("keeps the stored prepayments and recasts a caller without them does not show (ADR 0109)", () => {
    const prepayments = [
      {
        date: isoDate("2031-01-01"),
        amount: money("100000"),
        effect: "shortenTerm" as const,
      },
    ];
    const recasts = [
      { date: isoDate("2033-01-01"), maturity: isoDate("2050-01-01") },
    ];
    const m = mortgageFromForm(values, "m1", "p1", { prepayments, recasts });
    expect(m.prepayments).toBe(prepayments);
    expect(m.recasts).toBe(recasts);
    const fresh = mortgageFromForm(values, "m2", "p1", undefined);
    expect(fresh.prepayments).toBeUndefined();
    expect(fresh.recasts).toBeUndefined();
  });

  it("takes the form's prepayments and recasts, and clears them when empty (ADR 0116)", () => {
    const stored = {
      prepayments: [
        {
          date: isoDate("2031-01-01"),
          amount: money("100000"),
          effect: "shortenTerm" as const,
        },
      ],
      recasts: [{ date: isoDate("2033-01-01"), instalment: money("9000") }],
    };
    const entered = [
      {
        date: isoDate("2032-01-01"),
        amount: money("50000"),
        effect: "lowerInstalment" as const,
      },
    ];
    const m = mortgageFromForm(
      { ...values, prepayments: entered, recasts: [] },
      "m1",
      "p1",
      stored,
    );
    expect(m.prepayments).toEqual(entered);
    expect(m.recasts).toBeUndefined();
    expect(
      mortgageFromForm(
        { ...values, prepayments: null, recasts: null },
        "m1",
        "p1",
        stored,
      ).prepayments,
    ).toBeUndefined();
  });

  it("a new loan has no contract maturity", () => {
    expect(
      mortgageFromForm(values, "m2", "p1", undefined).contractMaturityDate,
    ).toBeUndefined();
  });

  // UX-054 (DR-130): the form now shows the field, so its value wins.
  it("takes the contract maturity the form shows, and clears it when blanked", () => {
    const stored = { contractMaturityDate: isoDate("2055-01-01") };
    const entered = isoDate("2054-06-01");
    expect(
      mortgageFromForm(
        { ...values, contractMaturityDate: entered },
        "m1",
        "p1",
        stored,
      ).contractMaturityDate,
    ).toBe(entered);
    expect(
      mortgageFromForm(
        { ...values, contractMaturityDate: null },
        "m1",
        "p1",
        stored,
      ).contractMaturityDate,
    ).toBeUndefined();
  });
});
