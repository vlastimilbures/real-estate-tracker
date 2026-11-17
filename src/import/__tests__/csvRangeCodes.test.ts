// #464: today's CSV error codes at each bound, pinned with literal values so moving the
// input rules into one module cannot change them.
import { describe, it, expect } from "vitest";
import { parseMortgages, parseProperties } from "../csv";

const PH = "name,size_m2,purchase_date,purchase_price";
const MH =
  "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years";
const KNOWN = new Set(["A"]);

/** One property row's errors (the cells after the name). */
const property = (size: string, date = "2020-01-01", price = "100") =>
  parseProperties(`${PH}\nA,${size},${date},${price}\n`).errors;

/** One mortgage row's errors. */
const mortgage = (fixation: string, term: string, rate = "0.05") =>
  parseMortgages(
    `${MH}\nA,2020-01-01,1000000,${fixation},${rate},6000,${term}\n`,
    KNOWN,
  ).errors;

const err = (row: number, field: string, error: object) => [
  { row, field, error },
];

describe("CSV fixation 0–50", () => {
  it("refuses -1 as not a whole number and 51 as out of range", () => {
    expect(mortgage("-1", "30")).toEqual(
      err(2, "fixation_years", { code: "invalidInteger", value: "-1" }),
    );
    expect(mortgage("51", "30")).toEqual(
      err(2, "fixation_years", {
        code: "outOfRange",
        value: "51",
        min: 0,
        max: 50,
      }),
    );
  });

  it("accepts 0 and 50", () => {
    expect(mortgage("0", "30")).toEqual([]);
    expect(mortgage("50", "30")).toEqual([]);
  });
});

describe("CSV loan term 1–50", () => {
  it("refuses 0 as not positive and 51 as out of range", () => {
    expect(mortgage("5", "0")).toEqual(
      err(2, "loan_term_years", { code: "notPositive", value: "0" }),
    );
    expect(mortgage("5", "51")).toEqual(
      err(2, "loan_term_years", {
        code: "outOfRange",
        value: "51",
        min: 1,
        max: 50,
      }),
    );
  });

  it("accepts 1 and 50", () => {
    expect(mortgage("5", "1")).toEqual([]);
    expect(mortgage("5", "50")).toEqual([]);
  });
});

describe("CSV size 1–10000, one decimal place", () => {
  it("refuses 0, 54.55 and 10000.1 with sizeRange", () => {
    for (const v of ["0", "54.55", "10000.1"])
      expect(property(v), v).toEqual(
        err(2, "size_m2", { code: "sizeRange", value: v, min: 1, max: 10000 }),
      );
  });

  it("accepts 1, 54.5 and 10000", () => {
    for (const v of ["1", "54.5", "10000"]) expect(property(v), v).toEqual([]);
  });
});

describe("CSV date floor", () => {
  it("refuses 1899-12-31 as earlyDate and accepts 1900-01-01", () => {
    expect(property("", "1899-12-31")).toEqual(
      err(2, "purchase_date", { code: "earlyDate", value: "1899-12-31" }),
    );
    expect(property("", "1900-01-01")).toEqual([]);
  });
});

describe("CSV negative zero", () => {
  it("refuses a -0 rate as out of range", () => {
    expect(mortgage("5", "30", "-0")).toEqual(
      err(2, "interest_rate_pa", { code: "rateOutOfRange", value: "-0" }),
    );
  });

  it("refuses a -0 amount as negative", () => {
    expect(property("", "2020-01-01", "-0")).toEqual(
      err(2, "purchase_price", { code: "negativeAmount", value: "-0" }),
    );
  });
});
