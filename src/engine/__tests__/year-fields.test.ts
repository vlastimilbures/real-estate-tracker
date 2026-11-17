// #478: every field of a projection year has one kind, checked by `tsc` (this file is
// in `tsconfig.json`): a field added to `ProjectionYear` and left out of the table is
// a compile error, so a new money field cannot stay nominal in the real series.
import { describe, it, expect } from "vitest";
import type { Decimal } from "../../lib/money";
import { portfolioProjection } from "../projections";
import { YEAR_FIELD_KINDS, fieldsOf, type YearFieldKind } from "../yearFields";
import { PORTFOLIO_SNAPSHOT_KINDS, PROPERTY_SNAPSHOT_KINDS } from "../real";
import type {
  PortfolioSnapshot,
  ProjectionYear,
  PropertySnapshot,
} from "../types";
import { assumptions } from "./support/seed";
import { mixed } from "./support/mixed";

type WithNewMoney = ProjectionYear & { newMoney: Decimal };

// The table classifies every field of today's year …
YEAR_FIELD_KINDS satisfies Record<keyof ProjectionYear, YearFieldKind>;
// @ts-expect-error … and a field it does not classify fails to compile.
YEAR_FIELD_KINDS satisfies Record<keyof WithNewMoney, YearFieldKind>;

// The same for the snapshot tables the real snapshots read.
type Kinds<T> = Record<keyof T, "label" | "money" | "ratio">;
type NewMoney = { newMoney: Decimal };
PROPERTY_SNAPSHOT_KINDS satisfies Kinds<PropertySnapshot>;
// @ts-expect-error a property snapshot field the table does not classify
PROPERTY_SNAPSHOT_KINDS satisfies Kinds<PropertySnapshot & NewMoney>;
PORTFOLIO_SNAPSHOT_KINDS satisfies Kinds<PortfolioSnapshot>;
// @ts-expect-error a portfolio snapshot field the table does not classify
PORTFOLIO_SNAPSHOT_KINDS satisfies Kinds<PortfolioSnapshot & NewMoney>;

describe("YEAR_FIELD_KINDS (#478)", () => {
  it("lists exactly the fields of a projection year", () => {
    const row = portfolioProjection(mixed, assumptions)[1]!;
    expect(Object.keys(YEAR_FIELD_KINDS).sort()).toEqual(
      Object.keys(row).sort(),
    );
  });

  it("has 21 money fields: all but the labels and the ratios", () => {
    const money = fieldsOf("stock", "derivedStock", "flow", "ownerFlow");
    expect(money).toHaveLength(21);
    expect(fieldsOf("label", "ratio")).toEqual([
      "year",
      "calendarYear",
      "periodStart",
      "periodEnd",
      "ltv",
      "dscr",
      "ratePa",
    ]);
  });
});
