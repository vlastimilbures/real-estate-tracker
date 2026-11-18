// The order of a row's errors is the order its cells are read in (#482): the required
// property columns first, the derived mortgage instalment last, the rest in template
// order. Synthetic data only.
import { describe, expect, it } from "vitest";
import { parseMortgages, parseProperties } from "../csv";

const fields = (r: { errors: { field: string }[] }) =>
  r.errors.map((e) => e.field);

describe("the errors of one CSV row", () => {
  it("name, purchase_date and purchase_price come before the other property columns", () => {
    const r = parseProperties(
      [
        "name,address,type,size_m2,garage,purchase_date,purchase_price",
        ",A,T,abc,maybe,2026-02-31,-1",
      ].join("\n"),
    );
    expect(fields(r)).toEqual([
      "name",
      "purchase_date",
      "purchase_price",
      "size_m2",
      "garage",
    ]);
  });

  it("an instalment that cannot be derived comes after every other mortgage column", () => {
    const r = parseMortgages(
      [
        "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years,contract_maturity_date",
        "Byt Javorova,2021-01-17,1912500,10,0.0169,,,2026-02-31",
      ].join("\n"),
    );
    expect(r.errors.map((e) => [e.field, e.error.code])).toEqual([
      ["contract_maturity_date", "impossibleDate"],
      ["monthly_instalment", "instalmentRequired"],
    ]);
  });
});
