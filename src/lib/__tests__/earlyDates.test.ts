// ADR 0149 §5: the 1900 floor for new dates and the stored dates before it.
import { describe, it, expect } from "vitest";
import { DATE_FLOOR_YEAR, earlyDateFields, isEarlyDate } from "../day";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const OK = day("2020-01-01");

describe("isEarlyDate", () => {
  it("is true before 01.01.1900 only", () => {
    expect(DATE_FLOOR_YEAR).toBe(1900);
    expect(isEarlyDate(day("1899-12-31"))).toBe(true);
    expect(isEarlyDate(day("1900-01-01"))).toBe(false);
  });
});

describe("earlyDateFields", () => {
  const mortgage = { id: "m1", startDate: OK };

  it("lists nothing for dates from 1900 on", () =>
    expect(
      earlyDateFields(
        {
          properties: [{ id: "p1", purchaseDate: OK }],
          mortgages: [mortgage],
          valuations: [{ id: "v1", validFrom: OK }],
          leases: [{ id: "l1", startDate: OK }],
        },
        { baseDate: OK },
      ),
    ).toEqual([]));

  it("names every stored date field before the floor", () => {
    const early = day("1850-01-01");
    const fields = earlyDateFields(
      {
        properties: [{ id: "p1", purchaseDate: early }],
        mortgages: [
          {
            id: "m1",
            startDate: early,
            completionDate: early,
            contractMaturityDate: early,
            draws: [{ date: OK }, { date: early }],
            prepayments: [{ date: early }],
            recasts: [{ date: OK, maturity: early }],
          },
        ],
        valuations: [{ id: "v1", validFrom: early, validTo: early }],
        leases: [{ id: "l1", startDate: early, endDate: early }],
      },
      { baseDate: early },
    );
    expect(fields.map((f) => `${f.entity}:${f.id ?? ""}:${f.field}`)).toEqual([
      "assumptions::baseDate",
      "property:p1:purchaseDate",
      "mortgage:m1:startDate",
      "mortgage:m1:completionDate",
      "mortgage:m1:contractMaturityDate",
      "mortgage:m1:draws",
      "mortgage:m1:prepayments",
      "mortgage:m1:recasts",
      "valuation:v1:validFrom",
      "valuation:v1:validTo",
      "lease:l1:startDate",
      "lease:l1:endDate",
    ]);
  });

  it("lists a loan event list once, with its earliest early date", () => {
    const [f] = earlyDateFields({
      properties: [],
      mortgages: [
        {
          ...mortgage,
          draws: [
            { date: day("1890-05-01") },
            { date: day("1026-09-01") },
            { date: OK },
          ],
        },
      ],
    });
    expect(f).toEqual({
      entity: "mortgage",
      id: "m1",
      field: "draws",
      date: day("1026-09-01"),
    });
  });
});
