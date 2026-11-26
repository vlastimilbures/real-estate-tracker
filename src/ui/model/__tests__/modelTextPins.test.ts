// What the Data check, the holding costs, the scenario compare table and the import
// preview say today, pinned whole in every language, so moving their code and sharing their
// tables cannot change a word.
import { describe, expect, it } from "vitest";
import { edate, rate, type Portfolio } from "../../../engine";
import {
  BASE_DATE,
  assumptions,
  portfolio,
} from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { getDict } from "../../../i18n";
import {
  dashboardDataCheck,
  findingFix,
  type DataCheckItem,
} from "../dataCheck";
import { dataCheckGroups, findingText, fixLabel } from "../dataCheckText";
import { holdingCostsView } from "../holdingCosts";
import {
  compareKpiRows,
  compareValueRows,
  type CompareResult,
} from "../compare";
import { changeText } from "../importPreview";
import { compareResult } from "../../__tests__/support/compareResult";

const LANGS = ["en", "cs", "ru"] as const;
const resetRate = assumptions.postFixationResetRatePa;

const checkOf = (p: Portfolio, asOf: Date) =>
  dashboardDataCheck(p, { asOf, baseDate: BASE_DATE, horizonYears: 30 });

describe("the Data check's words", () => {
  const cases: [string, Portfolio, Date][] = [
    ["sample today", portfolio, BASE_DATE],
    ["sample +5y", portfolio, edate(BASE_DATE, 60)],
    ["mixed today", mixed, BASE_DATE],
    ["mixed +2y", mixed, edate(BASE_DATE, 24)],
  ];
  for (const lang of LANGS)
    for (const [name, p, asOf] of cases)
      it(`${lang}: ${name}`, () => {
        const t = getDict(lang);
        const { attention, defaults } = checkOf(p, asOf);
        const line = (i: DataCheckItem) => {
          const fix = findingFix(i.finding);
          return {
            property: i.propertyId,
            text: findingText(t, i.finding, resetRate),
            fix,
            fixLabel: fixLabel(t, fix),
          };
        };
        expect({
          attention: attention.map(line),
          defaults: defaults.map(line),
          groups: [
            dataCheckGroups(t, attention, resetRate),
            dataCheckGroups(t, defaults, resetRate),
          ],
        }).toMatchSnapshot();
      });

  it.each(LANGS)(
    "%s: every holding cost named in a cost-defaults line",
    (lang) => {
      const t = getDict(lang);
      const text = findingText(
        t,
        {
          kind: "costDefaults",
          fields: [
            "propertyTaxYr",
            "insuranceYr",
            "svjMonthly",
            "otherYr",
            "mgmtPctRent",
            "maintPctRent",
          ],
        },
        resetRate,
      );
      expect(text).toMatchSnapshot();
    },
  );
});

describe("the holding costs' read view", () => {
  it.each(LANGS)("%s: each field's label and kind", (lang) => {
    const rows = holdingCostsView(
      undefined,
      assumptions.defaults,
      getDict(lang),
    );
    expect(rows.map(({ label, kind }) => ({ label, kind }))).toMatchSnapshot();
  });
});

describe("the scenario compare table", () => {
  const results: CompareResult[] = [
    compareResult("base"),
    compareResult("crash", "crash", {
      valueShock: { pct: rate("0.2"), atYear: 0 },
    }),
    compareResult("infl", "infl", {
      inflationShock: { deltaPa: rate("0.06"), durationYears: 3 },
    }),
  ];
  const base = results[0];
  const cells = (
    rows: { label: string; fmt: (r: CompareResult) => string }[],
  ) =>
    rows.map((row) => ({
      label: row.label,
      cells: results.map((r) => row.fmt(r)),
    }));
  for (const mode of ["nominal", "real"] as const) {
    it(`${mode}: values and Δ views`, () => {
      const t = getDict("en");
      expect({
        values: cells(compareKpiRows(t, mode, base, "values")),
        delta: cells(compareKpiRows(t, mode, base, "delta")),
        noBase: cells(compareKpiRows(t, mode)),
        exportCells: compareValueRows(t, mode, base).map((row) => ({
          label: row.label,
          kind: row.kind,
          cells: results.map((r) => row.value(r)),
        })),
      }).toMatchSnapshot();
    });
  }
});

describe("the import preview's change text", () => {
  // Every column an update can change, with a before and an after (the row keys,
  // valid_from and start_date, never differ on a matched row).
  const columns = [
    "name",
    "address",
    "type",
    "size_m2",
    "garage",
    "purchase_date",
    "purchase_price",
    "appreciation_override_pa",
    "rent_index_override_pa",
    "own_cash",
    "transaction_costs",
    "initial_works",
    "valid_to",
    "market_value",
    "end_date",
    "monthly_rent",
    "initial_principal",
    "fixation_years",
    "interest_rate_pa",
    "monthly_instalment",
    "loan_term_years",
    "contract_maturity_date",
  ];
  const text: Record<string, [string | null, string | null]> = {
    garage: ["0", "1"],
    name: ["Byt A", "Byt B"],
    address: [null, "Praha"],
    type: ["2+kk", "3+kk"],
  };
  const isDate = (field: string) => /date|valid_to/.test(field);
  it.each(LANGS)("%s", (lang) => {
    const t = getDict(lang);
    const lines = columns.flatMap((field) => {
      const pairs: [string | null, string | null][] =
        text[field] !== undefined
          ? [text[field]]
          : isDate(field)
            ? [
                ["2026-01-01", "2027-02-03"],
                [null, "2027-02-03"],
              ]
            : [
                ["0.0512", "0.05124"],
                ["1250000", null],
                ["1250000.4", "1250000.45"],
              ];
      return [
        field,
        ...pairs.map(([before, after]) =>
          changeText(t, { field, before, after }),
        ),
      ];
    });
    expect(lines).toMatchSnapshot();
  });
});
