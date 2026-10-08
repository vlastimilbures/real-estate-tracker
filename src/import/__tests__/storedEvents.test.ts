// ADR 0160 (#116): how a CSV import meets the loan events stored on a mortgage block
// (prepayments, maturity changes, draws), which only the mortgage form edits. Rebuilt
// from the review probes zz-probe-G1-5-1 and zz-probe-G1-5-2. Synthetic fixtures only.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { upsertAssumptions } from "../../data/repositories";
import { SEED_ASSUMPTIONS } from "../../data/seed";
import { parseMortgages, parseProperties } from "../csv";
import { importCsv, planImport, previewImport } from "../csvImport";

const PROPS = `name,address,purchase_date,purchase_price
Byt A,Javorova 12,2020-01-01,5000000`;
const MH =
  "property_name,start_date,initial_principal,fixation_years,interest_rate_pa,monthly_instalment,loan_term_years,contract_maturity_date";
/** Term 30 years; the seed baseDate is 2026-06-07, so this block is in force. */
const BLOCK = "Byt A,2021-01-17,2250000,10,0.0169,,30,";
const SUCCESSOR = "Byt A,2031-01-17,1500000,5,0.045,,15,";

let sql: TestSql;

const mortgages = (...rows: string[]) =>
  parseMortgages([MH, ...rows].join("\n")).rows;

/** Store loan events on the block starting on `startDate`, as the mortgage form does. */
function storeEvents(
  events: { prepayments?: unknown[]; recasts?: unknown[]; draws?: unknown[] },
  startDate = "2021-01-17",
) {
  const json = (v: unknown[] | undefined) => (v ? JSON.stringify(v) : null);
  sql.db
    .prepare(
      "UPDATE mortgage_blocks SET prepayments = ?, recasts = ?, draws = ? WHERE start_date = ?",
    )
    .run(
      json(events.prepayments),
      json(events.recasts),
      json(events.draws),
      startDate,
    );
}

const prepayment = (date: string) => ({
  date,
  amount: "300000",
  effect: "shortenTerm",
});

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await upsertAssumptions(sql, SEED_ASSUMPTIONS);
  await importCsv(sql, {
    properties: parseProperties(PROPS).rows,
    mortgages: mortgages(BLOCK),
  });
});

afterEach(() => sql.db.close());

describe("a CSV change that breaks a stored event (G1-5-1)", () => {
  it("names the event list, its date and the rule, not a CSV column", async () => {
    storeEvents({ prepayments: [prepayment("2045-01-17")] });
    const p = await previewImport(sql, {
      mortgages: mortgages("Byt A,2021-01-17,1912500,10,0.0169,,20,"),
    });
    expect(p.problems).toEqual([
      {
        file: "mortgages",
        row: 2,
        field: "",
        problem: {
          code: "storedEvent",
          list: "prepayments",
          date: "2045-01-17",
          rule: "EVENT_AFTER_SCHEDULE_END",
        },
      },
    ]);
  });

  it("two broken events give two lines with their own dates", async () => {
    storeEvents({
      prepayments: [
        prepayment("2030-01-17"),
        prepayment("2044-01-17"),
        prepayment("2045-01-17"),
      ],
    });
    const p = await previewImport(sql, {
      mortgages: mortgages("Byt A,2021-01-17,1912500,10,0.0169,,20,"),
    });
    const named = p.problems.map((x) =>
      x.problem.code === "storedEvent"
        ? `${x.problem.list} ${x.problem.date}`
        : x.problem.code,
    );
    expect(named).toEqual(["prepayments 2044-01-17", "prepayments 2045-01-17"]);
  });

  it("a stored draw is named with its date", async () => {
    storeEvents({ draws: [{ date: "2040-01-17", amount: "100000" }] });
    const p = await previewImport(sql, {
      mortgages: mortgages("Byt A,2021-01-17,2250000,10,0.0169,,10,"),
    });
    expect(p.problems).toContainEqual(
      expect.objectContaining({
        field: "",
        problem: {
          code: "storedEvent",
          list: "draws",
          date: "2040-01-17",
          rule: "DRAW_AFTER_SCHEDULE_END",
        },
      }),
    );
  });
});

describe("a new block replaces the previous block's later events (G1-5-2)", () => {
  it("lists the predecessor's prepayment dated after the new start", async () => {
    storeEvents({ prepayments: [prepayment("2032-01-17")] });
    const p = await previewImport(sql, { mortgages: mortgages(SUCCESSOR) });
    expect(p.problems).toEqual([]);
    expect(p.items).toEqual([
      expect.objectContaining({
        kind: "add",
        date: "2031-01-17",
        replaces: [{ kind: "prepayment", date: "2032-01-17" }],
      }),
    ]);
  });

  it("an event on or before the new start still applies and is not listed", async () => {
    storeEvents({
      prepayments: [prepayment("2031-01-17"), prepayment("2034-01-17")],
      recasts: [
        { date: "2028-01-17", maturity: "2049-01-17" },
        { date: "2033-01-17", maturity: "2048-01-17" },
      ],
    });
    const p = await previewImport(sql, { mortgages: mortgages(SUCCESSOR) });
    expect(p.items[0]?.replaces).toEqual([
      { kind: "recast", date: "2033-01-17" },
      { kind: "prepayment", date: "2034-01-17" },
    ]);
  });

  it("an event a later stored block already replaced is not listed again", async () => {
    await importCsv(sql, {
      mortgages: mortgages("Byt A,2036-01-17,1000000,5,0.04,,10,"),
    });
    storeEvents({
      prepayments: [prepayment("2033-01-17"), prepayment("2040-01-17")],
    });
    const p = await previewImport(sql, { mortgages: mortgages(SUCCESSOR) });
    expect(p.items[0]?.replaces).toEqual([
      { kind: "prepayment", date: "2033-01-17" },
    ]);
  });

  it("a new block in force at the base date replaces the old block's later events", async () => {
    storeEvents({
      prepayments: [prepayment("2024-01-17"), prepayment("2028-01-17")],
    });
    const p = await previewImport(sql, {
      mortgages: mortgages("Byt A,2025-01-17,1800000,5,0.045,,20,"),
    });
    expect(p.items[0]?.replaces).toEqual([
      { kind: "prepayment", date: "2028-01-17" },
    ]);
  });

  it("two new blocks: each lists only the events it stops", async () => {
    storeEvents({
      prepayments: [prepayment("2032-01-17"), prepayment("2034-01-17")],
    });
    const p = await previewImport(sql, {
      mortgages: mortgages(SUCCESSOR, "Byt A,2033-01-17,1200000,5,0.04,,10,"),
    });
    expect(p.items.map((i) => i.replaces)).toEqual([
      [
        { kind: "prepayment", date: "2032-01-17" },
        { kind: "prepayment", date: "2034-01-17" },
      ],
      undefined,
    ]);
  });

  it("an add that replaces nothing carries neither note", async () => {
    const p = await previewImport(sql, { mortgages: mortgages(SUCCESSOR) });
    expect(p.items[0]).not.toHaveProperty("replaces");
    expect(p.items[0]).not.toHaveProperty("noEffect");
  });

  it("an update of a stored block carries no list", async () => {
    storeEvents({ prepayments: [prepayment("2032-01-17")] });
    const p = await previewImport(sql, {
      mortgages: mortgages("Byt A,2021-01-17,2250000,10,0.0179,,30,"),
    });
    expect(p.items[0]).toEqual(expect.objectContaining({ kind: "update" }));
    expect(p.items[0]).not.toHaveProperty("replaces");
  });
});

describe("a block starting before the block in force (G1-5-2, probe 2b)", () => {
  it("is noted as having no effect", async () => {
    storeEvents({ prepayments: [prepayment("2032-01-17")] });
    const p = await previewImport(sql, {
      mortgages: mortgages("Byt A,2021-01-07,2000000,10,0.0169,,30,"),
    });
    expect(p.problems).toEqual([]);
    expect(p.items).toEqual([
      expect.objectContaining({ kind: "add", noEffect: true }),
    ]);
    expect(p.items[0]).not.toHaveProperty("replaces");
  });

  it("without a stored base date neither note is planned", () => {
    storeEvents({ prepayments: [prepayment("2032-01-17")] });
    const all = (table: string) =>
      sql.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    const tables = {
      properties: all("properties"),
      mortgage_blocks: all("mortgage_blocks"),
      valuations: [],
      leases: [],
      holding_costs: all("holding_costs"),
    } as unknown as Parameters<typeof planImport>[1];
    const plan = planImport(
      {
        mortgages: mortgages(
          "Byt A,2021-01-07,2000000,10,0.0169,,30,",
          SUCCESSOR,
        ),
      },
      tables,
      (key) => key,
    );
    for (const i of plan.items) {
      expect(i).not.toHaveProperty("replaces");
      expect(i).not.toHaveProperty("noEffect");
    }
  });
});
