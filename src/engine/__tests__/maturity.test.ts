// D-29: an optional contract maturity date per block. The engine reports the maturity
// the instalment implies (the due date of the last payment, D-08 term) and flags a
// contract date more than one month away. Not applied to development loans. Targets
// from the P02 report §5.
import { describe, it, expect } from "vitest";
import { isoDate } from "../dates";
import { impliedMaturity, maturityMismatch } from "../amortization";
import { validateInputs } from "../validate";
import { EngineInputError } from "../errors";
import { portfolioSnapshot } from "../metrics";
import type { IsoDate, MortgageBlock, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const block = (propertyId: string) =>
  portfolio.mortgages.find((m) => m.propertyId === propertyId)!;
const withContract = (b: MortgageBlock, d: string): MortgageBlock => ({
  ...b,
  contractMaturityDate: isoDate(d),
});

describe("impliedMaturity (D-29)", () => {
  it("is the last payment's due date for the seed loans (P02 §5)", () => {
    expect(iso(impliedMaturity(block("javorova")))).toBe("2051-05-17");
    expect(iso(impliedMaturity(block("lipova")))).toBe("2051-11-15");
    expect(iso(impliedMaturity(block("dubova")))).toBe("2040-12-12");
  });

  it("is null for a development loan", () => {
    expect(impliedMaturity(devBlock)).toBeNull();
  });
});

describe("maturityMismatch (D-29)", () => {
  const arg = block("dubova"); // implied 2040-12-12

  it("is null without a contract date", () => {
    expect(maturityMismatch(arg)).toBeNull();
  });

  it("is null within one month either way (NPER rounding, P02 §5)", () => {
    for (const d of ["2040-11-12", "2040-12-12", "2041-01-12"]) {
      expect(maturityMismatch(withContract(arg, d))).toBeNull();
    }
  });

  it("reports both dates when they differ by more than one month", () => {
    for (const d of ["2040-11-11", "2041-01-13", "2035-06-30"]) {
      const m = maturityMismatch(withContract(arg, d));
      expect(m && [iso(m.implied), iso(m.contract)]).toEqual(["2040-12-12", d]);
    }
  });

  it("is null for a development loan even with a contract date", () => {
    expect(maturityMismatch(withContract(devBlock, "2030-01-01"))).toBeNull();
  });
});

describe("contract maturity validation (D-29 + D-37)", () => {
  const bad: Portfolio = {
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      m.propertyId === "dubova"
        ? { ...m, contractMaturityDate: new Date(NaN) as IsoDate }
        : m,
    ),
  };
  const expected = {
    code: "INVALID_DATE",
    entity: "mortgage",
    id: block("dubova").id,
    field: "contractMaturityDate",
  };

  it("an invalid date is reported and raised", () => {
    expect(validateInputs(bad, assumptions)).toContainEqual(expected);
    expect(() => portfolioSnapshot(bad, assumptions)).toThrow(EngineInputError);
  });

  it("control: a contract date does not change any number", () => {
    const dated: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) => withContract(m, "2030-01-01")),
    };
    expect(validateInputs(dated, assumptions)).toEqual([]);
    expect(portfolioSnapshot(dated, assumptions)).toEqual(
      portfolioSnapshot(portfolio, assumptions),
    );
  });
});
