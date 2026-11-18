// The column tables in docs/csv-import.md must match the column specs the parser and the
// templates read (#482), so the guide cannot drift from the importer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INT_RANGES } from "../../lib/rules";
import {
  MORTGAGE_COLUMNS,
  PROPERTY_COLUMNS,
  RENT_COLUMNS,
  VALUATION_COLUMNS,
  type ColumnKind,
  type ColumnSpec,
} from "../columns";

const guide = readFileSync(
  join(__dirname, "..", "..", "..", "docs", "csv-import.md"),
  "utf8",
);

interface DocRow {
  column: string;
  required: string;
  type: string;
  notes: string;
}

/** The first table after a file's `### <file>` heading. */
function table(file: string): DocRow[] {
  const at = guide.indexOf(`### ${file}\n`);
  expect(at).toBeGreaterThanOrEqual(0);
  const lines = guide.slice(at).split("\n");
  const start = lines.findIndex((l) => l.startsWith("|"));
  const end = lines.findIndex((l, i) => i > start && !l.startsWith("|"));
  const [head, , ...body] = lines.slice(start, end).map((l) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim()),
  );
  expect(head).toEqual(["Column", "Required", "Type", "Notes"]);
  return body.map(([column = "", required = "", type = "", notes = ""]) => ({
    column,
    required,
    type,
    notes,
  }));
}

/** How the guide names each kind (its "Types used below" list). */
const TYPE_NAME: Record<ColumnKind, string> = {
  text: "Text",
  knownProperty: "Text",
  date: "Date",
  amount: "Money",
  unitRate: "Fraction",
  signedRate: "Fraction",
  int: "Whole number",
  size: "Size",
  bool: "Yes/no",
};

const requiredText = (c: ColumnSpec) =>
  c.derive ? "conditional" : c.required ? "yes" : "no";

/** `1–10 000`, as the guide writes a range. */
const rangeText = ({ min, max }: { min: number; max: number }) =>
  [min, max].map((n) => String(n).replace(/\B(?=(\d{3})+$)/g, " ")).join("–");

const FILES: [string, readonly ColumnSpec[]][] = [
  ["properties.csv", PROPERTY_COLUMNS],
  ["valuations.csv", VALUATION_COLUMNS],
  ["rents.csv", RENT_COLUMNS],
  ["mortgages.csv", MORTGAGE_COLUMNS],
];

describe("docs/csv-import.md column tables", () => {
  it.each(FILES)("%s lists the spec's columns in order", (file, columns) => {
    expect(table(file).map((r) => r.column)).toEqual(
      columns.map((c) => `\`${c.name}\``),
    );
  });

  it.each(FILES)(
    "%s states each column's Required and Type",
    (file, columns) => {
      expect(table(file).map((r) => [r.required, r.type])).toEqual(
        columns.map((c) => [requiredText(c), TYPE_NAME[c.kind]]),
      );
    },
  );

  it.each(FILES)("%s states each bounded column's range", (file, columns) => {
    const rows = table(file);
    columns.forEach((c, i) => {
      if (c.kind !== "int" && c.kind !== "size") return;
      expect(Object.values(INT_RANGES)).toContain(c.range);
      expect(rows[i]?.notes.startsWith(rangeText(c.range))).toBe(true);
    });
  });

  it("the bounded columns are the loan term, fixation and size", () => {
    const ranged = FILES.flatMap(([, cs]) =>
      cs.flatMap((c) =>
        c.kind === "int" || c.kind === "size" ? [[c.name, c.range]] : [],
      ),
    );
    expect(ranged).toEqual([
      ["size_m2", INT_RANGES.sizeM2],
      ["fixation_years", INT_RANGES.fixationYears],
      ["loan_term_years", INT_RANGES.loanTermYears],
    ]);
  });
});
