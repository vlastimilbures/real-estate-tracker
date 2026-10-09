// DB write layer for CSV import. Distinct from csv.ts (pure parse) so each is testable.
//
// All or nothing (P5b, DR-023): the current rows are read once, every property name is
// resolved (D-55) and the merged result is checked against the engine's input rules
// BEFORE anything is written. The write is then a single `Sql.transaction` (D-14): every
// statement commits, or none does.
//
// ADR 0096: `planImport` classifies each row as add / update / unchanged. The preview
// and the commit share it, and a commit whose plan differs from the previewed one
// writes nothing.
import type { Sql, SqlStatement } from "../data/sql";
import { insertStatement } from "../data/repositories";
import {
  rowToAssumptions,
  rowToHoldingCost,
  rowToLease,
  rowToMortgageBlock,
  rowToProperty,
  rowToValuation,
  type AssumptionsRow,
  type HoldingCostRow,
  type LeaseRow,
  type MortgageBlockRow,
  type PropertyRow,
  type ValuationRow,
} from "../data/mappers";
import {
  leaseOverlapErrors,
  loanChainChanges,
  validatePortfolio,
  type Assumptions,
  type EngineValidationError,
  type MortgageBlock,
  type ValidationCode,
  type ValidationEntity,
} from "../engine";
import { isoDay } from "../lib/day";
import {
  type ParsedMortgageRow,
  type ParsedPropertyRow,
  type ParsedRentRow,
  type ParsedValuationRow,
} from "./csv";
import { D } from "../lib/money";
import { propertyKey } from "../lib/propertyKey";

export interface CsvImportBatch {
  properties?: ParsedPropertyRow[] | undefined;
  valuations?: ParsedValuationRow[] | undefined;
  rents?: ParsedRentRow[] | undefined;
  mortgages?: ParsedMortgageRow[] | undefined;
}

export type CsvFile = keyof CsvImportBatch;

/** ADR 0096: no stored match · a match with ≥1 changed CSV column · a match without. */
export type ImportKind = "add" | "update" | "unchanged";

/** One CSV column an update changes, as stored text (`null` = empty). */
export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

/** What the import does with one CSV row. */
export interface ImportItem {
  file: CsvFile;
  /** Physical file line. */
  row: number;
  kind: ImportKind;
  propertyId: string;
  /** The stored spelling for a match (D-55), else the CSV's. */
  propertyName: string;
  /** A child row's key date (`valid_from` / `start_date`); `null` for a property. */
  date: string | null;
  /** Empty unless `kind` is `"update"`. */
  changes: FieldChange[];
  /** An added mortgage block: the previous block's events it stops (ADR 0160). */
  replaces?: ReplacedEvent[];
  /** An added mortgage block that starts before the block in force (ADR 0160). */
  noEffect?: true;
}

/** A stored prepayment or maturity change that a new block replaces (ADR 0109 §9). */
export interface ReplacedEvent {
  kind: "prepayment" | "recast";
  /** ISO date. */
  date: string;
}

/** The loan event lists only the mortgage form edits; a CSV keeps them (ADR 0109). */
export type StoredEventList = "prepayments" | "recasts" | "draws";
const STORED_EVENT_LISTS: readonly string[] = [
  "prepayments",
  "recasts",
  "draws",
];

export interface CsvImportReport {
  upserted: {
    properties: number;
    valuations: number;
    leases: number;
    mortgage_blocks: number;
  };
  items: ImportItem[];
}

/** A plan shown before importing: what would happen, and what would refuse it. */
export interface CsvImportPreview {
  items: ImportItem[];
  problems: CsvImportProblem[];
  /** Identifies the plan; the commit refuses when its own plan differs (ADR 0096). */
  fingerprint: string;
}

export type CsvImportProblemCode =
  | { code: "unknownProperty"; value: string }
  /** The merged data breaks an engine input rule (D-17, D-27, D-37, D-42). */
  | { code: "inputRule"; rule: ValidationCode }
  /** The CSV row makes a stored loan event break a rule (ADR 0160). */
  | {
      code: "storedEvent";
      list: StoredEventList;
      /** The event's ISO date. */
      date: string;
      rule: ValidationCode;
    };

export interface CsvImportProblem {
  file: CsvFile;
  /** Physical file line. */
  row: number;
  field: string;
  problem: CsvImportProblemCode;
}

/** The import was refused before anything was written. */
export class CsvImportError extends Error {
  readonly problems: CsvImportProblem[];
  constructor(problems: CsvImportProblem[]) {
    super(
      `CSV import refused: ${problems.length} problem(s). Nothing was imported.`,
    );
    this.name = "CsvImportError";
    this.problems = problems;
  }
}

/** The plan changed between preview and commit; nothing was written (ADR 0096). */
export class CsvPlanChangedError extends Error {
  readonly preview: CsvImportPreview;
  constructor(preview: CsvImportPreview) {
    super("CSV import refused: the data changed since the preview.");
    this.name = "CsvPlanChangedError";
    this.preview = preview;
  }
}

/** The stored rows an import plan is computed against. */
export interface ImportTables {
  properties: PropertyRow[];
  mortgage_blocks: MortgageBlockRow[];
  valuations: ValuationRow[];
  leases: LeaseRow[];
  holding_costs: HoldingCostRow[];
  /** The stored assumptions; without them the plan adds no loan-chain notes. */
  assumptions?: AssumptionsRow | undefined;
}

async function readTables(sql: Sql): Promise<ImportTables> {
  const [properties, mortgage_blocks, valuations, leases, holding_costs, a] =
    await Promise.all([
      sql.select<PropertyRow>("SELECT * FROM properties ORDER BY id"),
      sql.select<MortgageBlockRow>("SELECT * FROM mortgage_blocks ORDER BY id"),
      sql.select<ValuationRow>("SELECT * FROM valuations ORDER BY id"),
      sql.select<LeaseRow>("SELECT * FROM leases ORDER BY id"),
      sql.select<HoldingCostRow>("SELECT * FROM holding_costs ORDER BY id"),
      sql.select<AssumptionsRow>("SELECT * FROM assumptions WHERE id = 1"),
    ]);
  return {
    properties,
    mortgage_blocks,
    valuations,
    leases,
    holding_costs,
    assumptions: a[0],
  };
}

/** UPDATE `table` SET <only these columns> WHERE id = ? — columns the CSV does not
 *  model are left as stored. */
function updateStatement(
  table: string,
  id: string,
  values: Record<string, unknown>,
): SqlStatement {
  const cols = Object.keys(values);
  return {
    query: `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
    params: [...Object.values(values), id],
  };
}

const snake = (field: string) =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Replace the row with the same id in `rows`, or append it. */
function put<R extends { id: string }>(rows: R[], row: R): void {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
}

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;

/** Stored text of a cell value; empty ⇒ `null`. */
function cellText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

/** Equal for the user: both empty, the same decimal value, or the same text. */
function sameValue(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  if (DECIMAL_TEXT.test(a) && DECIMAL_TEXT.test(b)) return D(a).eq(D(b));
  return a === b;
}

/** The CSV columns whose value would change on `stored`. */
function changesOf(stored: object, fields: object): FieldChange[] {
  const row = stored as Record<string, unknown>;
  const out: FieldChange[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const before = cellText(row[field]);
    const after = cellText(value);
    if (!sameValue(before, after)) out.push({ field, before, after });
  }
  return out;
}

const kindOf = (existing: unknown, changes: FieldChange[]): ImportKind =>
  !existing ? "add" : changes.length > 0 ? "update" : "unchanged";

/** The ISO date of the stored loan event an input-rule error names, if it names one. */
function storedEventDate(
  blocks: MortgageBlock[],
  e: EngineValidationError,
): string | undefined {
  if (e.entity !== "mortgage" || e.index === undefined) return undefined;
  if (!STORED_EVENT_LISTS.includes(e.field ?? "")) return undefined;
  const block = blocks.find((b) => b.id === e.id);
  const list = block?.[e.field as StoredEventList] as
    { date: Date }[] | undefined;
  const date = list?.[e.index]?.date;
  return date && !Number.isNaN(date.getTime()) ? isoDay(date) : undefined;
}

/**
 * ADR 0160: what each added mortgage block does to its property's loan chain, as the
 * engine's schedule sees it (`loanChainChanges`). A block the schedule does not use
 * (it starts before the block in force) gets `noEffect`; a block that takes over from
 * a stored block lists the stored prepayments and maturity changes it stops.
 */
function noteChainEffects(
  added: Map<string, ImportItem>,
  stored: MortgageBlock[],
  merged: MortgageBlock[],
  assumptions: Assumptions,
): void {
  const properties = new Set([...added.values()].map((i) => i.propertyId));
  for (const propertyId of properties) {
    const mine = (b: MortgageBlock) => b.propertyId === propertyId;
    const { stopped, unused } = loanChainChanges(
      stored.filter(mine),
      merged.filter(mine),
      assumptions,
    );
    for (const id of unused) {
      const item = added.get(id);
      if (item) item.noEffect = true;
    }
    for (const s of stopped) {
      const item = added.get(s.by);
      if (item)
        item.replaces = [
          ...(item.replaces ?? []),
          { kind: s.kind, date: isoDay(s.date) },
        ];
    }
  }
}

/** What an import would write, computed without touching the DB. */
export interface ImportPlan extends CsvImportPreview {
  statements: SqlStatement[];
  report: CsvImportReport;
}

/** Match every row against `tables` (D-55), build the write statements and check the
 *  merged result against the engine's input rules. A new property's id comes from
 *  `newPropertyId(key)`, keyed by its matching name (ADR 0127). Pure: `tables` is not
 *  modified. */
export function planImport(
  batch: CsvImportBatch,
  tables: ImportTables,
  newPropertyId: (key: string) => string,
): ImportPlan {
  const db: ImportTables = {
    properties: [...tables.properties],
    mortgage_blocks: [...tables.mortgage_blocks],
    valuations: [...tables.valuations],
    leases: [...tables.leases],
    holding_costs: [...tables.holding_costs],
  };
  const statements: SqlStatement[] = [];
  const problems: CsvImportProblem[] = [];
  const items: ImportItem[] = [];
  /** Which file line produced each written row, as `${entity}:${id}`. */
  const origin = new Map<string, { file: CsvFile; row: number }>();
  const report: CsvImportReport = {
    upserted: { properties: 0, valuations: 0, leases: 0, mortgage_blocks: 0 },
    items,
  };

  const byKey = new Map(db.properties.map((p) => [propertyKey(p.name), p]));
  const withCosts = new Set(db.holding_costs.map((h) => h.property_id));

  // Properties first (FK parent). An existing property keeps its id, stored spelling
  // and active flag; CSV doesn't model activation (D-55).
  for (const p of batch.properties ?? []) {
    const existing = byKey.get(propertyKey(p.name));
    const fields = {
      address: p.address,
      type: p.type,
      size_m2: p.size_m2,
      garage: p.garage === null ? null : p.garage ? 1 : 0,
      purchase_date: p.purchase_date,
      purchase_price: p.purchase_price,
      appreciation_override_pa: p.appreciation_override_pa,
      rent_index_override_pa: p.rent_index_override_pa,
      // ADR 0119 §8: a blank funding cell keeps the stored amount; a CSV sets or
      // changes a recorded figure, never erases it.
      ...(p.own_cash !== null && { own_cash: p.own_cash }),
      ...(p.transaction_costs !== null && {
        transaction_costs: p.transaction_costs,
      }),
      ...(p.initial_works !== null && { initial_works: p.initial_works }),
    };
    const row: PropertyRow = existing
      ? { ...existing, ...fields }
      : {
          id: newPropertyId(propertyKey(p.name)),
          name: p.name,
          ...fields,
          active: 1,
          own_cash: p.own_cash,
          transaction_costs: p.transaction_costs,
          initial_works: p.initial_works,
          // ADR 0119 §8: the note is not a CSV column.
          funding_note: null,
        };
    statements.push(
      existing
        ? updateStatement("properties", row.id, fields)
        : insertStatement("properties", row),
    );
    put(db.properties, row);
    byKey.set(propertyKey(p.name), row);
    origin.set(`property:${row.id}`, { file: "properties", row: p.line });
    const changes = existing ? changesOf(existing, fields) : [];
    items.push({
      file: "properties",
      row: p.line,
      kind: kindOf(existing, changes),
      propertyId: row.id,
      propertyName: row.name,
      date: null,
      changes,
    });
    // Every property gets a holding-costs row so the edit form works.
    if (!withCosts.has(row.id)) {
      const costs: HoldingCostRow = {
        id: `hc-${row.id}`,
        property_id: row.id,
        property_tax_yr: null,
        insurance_yr: null,
        mgmt_pct_rent: null,
        maint_pct_rent: null,
        svj_monthly: null,
        other_yr: null,
      };
      statements.push(insertStatement("holding_costs", costs));
      db.holding_costs.push(costs);
      withCosts.add(row.id);
    }
    report.upserted.properties++;
  }

  const resolve = (file: CsvFile, row: number, name: string) => {
    const id = byKey.get(propertyKey(name))?.id;
    if (id === undefined)
      problems.push({
        file,
        row,
        field: "property_name",
        problem: { code: "unknownProperty", value: name },
      });
    return id;
  };

  /** Update the row with the same natural key, or insert a new one. Returns the
   *  plan item and the id of the row written. */
  function upsertChild<R extends { id: string; property_id: string }>(
    table: "mortgage_blocks" | "valuations" | "leases",
    entity: ValidationEntity,
    rows: R[],
    match: (r: R) => boolean,
    fresh: R,
    fields: Partial<R>,
    at: { file: CsvFile; row: number },
    date: string,
  ): { item: ImportItem; id: string } {
    const existing = rows.find(match);
    const changes = existing ? changesOf(existing, fields) : [];
    const item: ImportItem = {
      ...at,
      kind: kindOf(existing, changes),
      propertyId: fresh.property_id,
      propertyName:
        db.properties.find((p) => p.id === fresh.property_id)?.name ?? "",
      date,
      changes,
    };
    items.push(item);
    // A stored row whose date was edited after an earlier import keeps the id generated
    // from its old date; suffix a fresh id instead of clashing on the key (DR-137).
    let id = fresh.id;
    for (let n = 2; rows.some((r) => r.id === id); n++) id = `${fresh.id}-${n}`;
    const row = existing ? { ...existing, ...fields } : { ...fresh, id };
    statements.push(
      existing
        ? updateStatement(table, row.id, fields)
        : insertStatement(table, row),
    );
    put(rows, row);
    origin.set(`${entity}:${row.id}`, at);
    return { item, id: row.id };
  }

  /** The mortgage blocks this import adds, by row id (ADR 0160). */
  const addedBlocks = new Map<string, ImportItem>();
  for (const m of batch.mortgages ?? []) {
    const propId = resolve("mortgages", m.line, m.property_name);
    if (propId === undefined) continue;
    const fields: Partial<MortgageBlockRow> = {
      initial_principal: m.initial_principal,
      fixation_years: m.fixation_years,
      interest_rate_pa: m.interest_rate_pa,
      monthly_instalment: m.monthly_instalment,
      loan_term_years: m.loan_term_years,
      // Blank ⇒ keep the stored maturity (DR-129). Draws and the interest-only date
      // are not CSV columns, so they are never touched.
      ...(m.contract_maturity_date !== null && {
        contract_maturity_date: m.contract_maturity_date,
      }),
    };
    const { item, id } = upsertChild(
      "mortgage_blocks",
      "mortgage",
      db.mortgage_blocks,
      (r) => r.property_id === propId && r.start_date === m.start_date,
      {
        id: `${propId}-csv-m-${m.start_date}`,
        property_id: propId,
        start_date: m.start_date,
        initial_principal: m.initial_principal,
        fixation_years: m.fixation_years,
        interest_rate_pa: m.interest_rate_pa,
        monthly_instalment: m.monthly_instalment,
        loan_term_years: m.loan_term_years,
        draws: null,
        interest_only_until: null,
        contract_maturity_date: m.contract_maturity_date,
        prepayments: null,
        recasts: null,
      },
      fields,
      { file: "mortgages", row: m.line },
      m.start_date,
    );
    if (item.kind === "add") addedBlocks.set(id, item);
    report.upserted.mortgage_blocks++;
  }

  for (const v of batch.valuations ?? []) {
    const propId = resolve("valuations", v.line, v.property_name);
    if (propId === undefined) continue;
    const fields = { valid_to: v.valid_to, market_value: v.market_value };
    upsertChild(
      "valuations",
      "valuation",
      db.valuations,
      (r) => r.property_id === propId && r.valid_from === v.valid_from,
      {
        id: `${propId}-csv-v-${v.valid_from}`,
        property_id: propId,
        valid_from: v.valid_from,
        ...fields,
      },
      fields,
      { file: "valuations", row: v.line },
      v.valid_from,
    );
    report.upserted.valuations++;
  }

  for (const r of batch.rents ?? []) {
    const propId = resolve("rents", r.line, r.property_name);
    if (propId === undefined) continue;
    const fields = { end_date: r.end_date, monthly_rent: r.monthly_rent };
    upsertChild(
      "leases",
      "lease",
      db.leases,
      (l) => l.property_id === propId && l.start_date === r.start_date,
      {
        id: `${propId}-csv-r-${r.start_date}`,
        property_id: propId,
        start_date: r.start_date,
        ...fields,
      },
      fields,
      { file: "rents", row: r.line },
      r.start_date,
    );
    report.upserted.leases++;
  }

  if (problems.length === 0) {
    // The engine's input rules and the lease overlap rule (ADR 0163) over the merged
    // portfolio; only rows this import wrote can be at fault (stored rows passed the
    // rules when they were saved, or predate them: a stored overlap is not this
    // import's to report).
    const merged = {
      properties: db.properties.map(rowToProperty),
      mortgages: db.mortgage_blocks.map(rowToMortgageBlock),
      valuations: db.valuations.map(rowToValuation),
      leases: db.leases.map(rowToLease),
      holdingCosts: db.holding_costs.map(rowToHoldingCost),
    };
    for (const e of [
      ...validatePortfolio(merged),
      ...leaseOverlapErrors(merged),
    ]) {
      const at = origin.get(`${e.entity}:${e.id}`);
      if (!at) continue;
      // A stored event is not a CSV column: name the event, not a field (ADR 0160).
      const date = storedEventDate(merged.mortgages, e);
      problems.push(
        date === undefined
          ? {
              ...at,
              field: e.field ? snake(e.field) : "",
              problem: { code: "inputRule", rule: e.code },
            }
          : {
              ...at,
              field: "",
              problem: {
                code: "storedEvent",
                list: e.field as StoredEventList,
                date,
                rule: e.code,
              },
            },
      );
    }
    if (problems.length === 0 && addedBlocks.size > 0 && tables.assumptions)
      noteChainEffects(
        addedBlocks,
        tables.mortgage_blocks.map(rowToMortgageBlock),
        merged.mortgages,
        rowToAssumptions(tables.assumptions),
      );
  }
  const fingerprint = JSON.stringify({ items, statements });
  return { statements, problems, items, fingerprint, report };
}

/** The new property ids of each batch (ADR 0127): a batch's preview and its import must
 *  plan the same ids, or their fingerprints differ (ADR 0096). The Import page keeps one
 *  batch object for both. */
const batchIds = new WeakMap<CsvImportBatch, Map<string, string>>();

function idsFor(batch: CsvImportBatch): (key: string) => string {
  let ids = batchIds.get(batch);
  if (!ids) batchIds.set(batch, (ids = new Map()));
  const known = ids;
  return (key) => {
    let id = known.get(key);
    if (id === undefined) known.set(key, (id = crypto.randomUUID()));
    return id;
  };
}

const previewOf = (plan: ImportPlan): CsvImportPreview => ({
  items: plan.items,
  problems: plan.problems,
  fingerprint: plan.fingerprint,
});

/** The plan for `batch` against the stored data. Reads only; never writes. */
export async function previewImport(
  sql: Sql,
  batch: CsvImportBatch,
): Promise<CsvImportPreview> {
  return previewOf(planImport(batch, await readTables(sql), idsFor(batch)));
}

/** Write `batch` in one transaction. With `expected` (a previewed plan's fingerprint),
 *  refuse with `CsvPlanChangedError` when the plan is no longer the same (ADR 0096). */
export async function importCsv(
  sql: Sql,
  batch: CsvImportBatch,
  expected?: string,
): Promise<CsvImportReport> {
  const plan = planImport(batch, await readTables(sql), idsFor(batch));
  if (plan.problems.length > 0) throw new CsvImportError(plan.problems);
  if (expected !== undefined && expected !== plan.fingerprint)
    throw new CsvPlanChangedError(previewOf(plan));

  await sql.transaction(plan.statements);
  // Written: importing the same batch again makes new ids for any property it adds.
  batchIds.delete(batch);
  return plan.report;
}
