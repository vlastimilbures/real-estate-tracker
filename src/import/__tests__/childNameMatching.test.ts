// ADR 0254 left the name check to the import plan alone: a child row (valuations, rents,
// mortgages) matches its stored or same-batch property trimmed, case-insensitively (D-55)
// and in one Unicode form (ADR 0237), and adds no property. DB level, on the seeded sample
// portfolio plus a stored composed (NFC) "Národní 12". The padded name is quoted so its
// spaces are in the cell; the parser trims it too. Escapes keep the two forms apart.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import {
  parseMortgages,
  parseProperties,
  parseRents,
  parseValuations,
} from "../csv";
import { previewImport } from "../csvImport";
import { importNow } from "./support/importNow";

const NFC = "N\u00e1rodn\u00ed 12";
const NFD = "Na\u0301rodni\u0301 12";
const NARODNI = "00000000-0000-4000-8000-0000000000aa";
const VH = "property_name,valid_from,valid_to,market_value";
const RH = "property_name,start_date,end_date,monthly_rent";
const MH =
  "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment";

let sql: TestSql;
beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  sql.db
    .prepare(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES (?, ?, '2019-01-01', '4000000')",
    )
    .run(NARODNI, NFC);
});
afterEach(() => sql.db.close());

const idOf = (name: string): string =>
  (
    sql.db.prepare("SELECT id FROM properties WHERE name = ?").get(name) as {
      id: string;
    }
  ).id;
const propertyCount = (): number =>
  (
    sql.db.prepare("SELECT COUNT(*) AS n FROM properties").get() as {
      n: number;
    }
  ).n;
/** The property ids of a child table's rows that start on `date`. */
const childIds = (table: string, dateColumn: string, date: string) =>
  (
    sql.db
      .prepare(
        `SELECT property_id FROM ${table} WHERE ${dateColumn} = ? ORDER BY property_id`,
      )
      .all(date) as { property_id: string }[]
  ).map((r) => r.property_id);

describe("child rows match their property in the import plan (ADR 0254)", () => {
  it("a padded, mixed-case name and a decomposed name land on the stored properties", async () => {
    const javorova = idOf("Byt Javorova");
    const before = propertyCount();
    const batch = {
      valuations: parseValuations(
        `${VH}\n"  bYT jAVOROVA  ",2027-06-01,,12000000\n${NFD},2027-06-01,,5000000`,
      ).rows,
      rents: parseRents(
        `${RH}\n"  bYT jAVOROVA  ",2024-01-01,2024-12-31,30000\n${NFD},2024-01-01,2024-12-31,20000`,
      ).rows,
      mortgages: parseMortgages(
        `${MH}\n"  bYT jAVOROVA  ",2035-01-17,1000000,5,0.04,9000\n${NFD},2035-01-17,2000000,5,0.04,15000`,
      ).rows,
    };
    expect((await previewImport(sql, batch)).problems).toEqual([]);
    const report = await importNow(sql, batch);

    expect(report.items.map((i) => [i.file, i.kind, i.propertyId])).toEqual([
      ["mortgages", "add", javorova],
      ["mortgages", "add", NARODNI],
      ["valuations", "add", javorova],
      ["valuations", "add", NARODNI],
      ["rents", "add", javorova],
      ["rents", "add", NARODNI],
    ]);
    const both = [javorova, NARODNI].sort();
    expect(childIds("valuations", "valid_from", "2027-06-01")).toEqual(both);
    expect(childIds("leases", "start_date", "2024-01-01")).toEqual(both);
    expect(childIds("mortgage_blocks", "start_date", "2035-01-17")).toEqual(
      both,
    );
    expect(propertyCount()).toBe(before);
  });

  it("a decomposed child row lands on a composed name from the same batch's properties.csv", async () => {
    sql.db.prepare("DELETE FROM properties WHERE id = ?").run(NARODNI);
    const before = propertyCount();
    const report = await importNow(sql, {
      properties: parseProperties(
        `name,purchase_date,purchase_price\n${NFC},2019-01-01,4000000`,
      ).rows,
      valuations: parseValuations(`${VH}\n${NFD},2027-06-01,,5000000`).rows,
      rents: parseRents(`${RH}\n${NFD},2024-01-01,2024-12-31,20000`).rows,
      mortgages: parseMortgages(`${MH}\n${NFD},2035-01-17,2000000,5,0.04,15000`)
        .rows,
    });

    expect(propertyCount()).toBe(before + 1);
    const id = idOf(NFC);
    expect(report.items.map((i) => [i.file, i.kind, i.propertyId])).toEqual([
      ["properties", "add", id],
      ["mortgages", "add", id],
      ["valuations", "add", id],
      ["rents", "add", id],
    ]);
    expect(childIds("valuations", "valid_from", "2027-06-01")).toEqual([id]);
    expect(childIds("leases", "start_date", "2024-01-01")).toEqual([id]);
    expect(childIds("mortgage_blocks", "start_date", "2035-01-17")).toEqual([
      id,
    ]);
  });
});
