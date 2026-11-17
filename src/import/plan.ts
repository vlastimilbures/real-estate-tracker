// The CSV import plan (ADR 0096): every parsed row matched against the stored rows
// (D-55) and classified as add / update / unchanged, the write statements, and the
// merged result checked against the engine's input rules. Pure: no IO; csvImport.ts reads
// the stored rows and writes the plan.
import type { SqlStatement } from "../data/sql";
import { insertStatement, updateStatement } from "../data/repositories";
import {
  rowToAssumptions,
  rowToHoldingCost,
  rowToLease,
  rowToMortgageBlock,
  rowToProperty,
  rowToValuation,
  toColumn,
  type AssumptionsRow,
  type HoldingCostRow,
  type LeaseRow,
  type MortgageBlockRow,
  type PropertyRow,
  type ValuationRow,
} from "../data/mappers";
import {
  leaseOverlapErrors,
  validatePortfolio,
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
import { noteChainEffects } from "./chainEffects";
import { changesOf, kindOf } from "./diff";
import { propertyKey, spellingKey } from "../lib/propertyKey";

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

/** A plan shown before importing: what would happen, and what would refuse it. */
export interface CsvImportPreview {
  items: ImportItem[];
  problems: CsvImportProblem[];
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

/** The child files, in import order: each file's table, validation entity and the tag
 *  in a new row's id. */
const CHILD_FILES = {
  mortgages: { table: "mortgage_blocks", entity: "mortgage", tag: "m" },
  valuations: { table: "valuations", entity: "valuation", tag: "v" },
  rents: { table: "leases", entity: "lease", tag: "r" },
} as const satisfies Record<
  Exclude<CsvFile, "properties">,
  { table: string; entity: ValidationEntity; tag: string }
>;

type ChildRow = MortgageBlockRow | ValuationRow | LeaseRow;

/** A child row's key date (`valid_from` / `start_date`). */
const keyDate = (r: ChildRow) =>
  "valid_from" in r ? r.valid_from : r.start_date;

/** One child table's rows by id, and their ids by property and key date. A Map keeps a
 *  replaced row in its place and appends a new one, so the rows keep the stored order.
 *  `find` returns the first row in that order with the key, as it stands now. */
function childIndex<R extends ChildRow>(stored: R[]) {
  const rows = new Map(stored.map((r) => [r.id, r]));
  const ids = new Map<string, Map<string, string>>();
  const add = (r: R) => {
    let byDate = ids.get(r.property_id);
    if (!byDate) ids.set(r.property_id, (byDate = new Map()));
    if (!byDate.has(keyDate(r))) byDate.set(keyDate(r), r.id);
  };
  for (const r of rows.values()) add(r);
  return {
    rows,
    find(propertyId: string, date: string): R | undefined {
      const id = ids.get(propertyId)?.get(date);
      const r = id === undefined ? undefined : rows.get(id);
      // A Map matches NaN to NaN; the key match is strict.
      return r && r.property_id === propertyId && keyDate(r) === date
        ? r
        : undefined;
    },
    set(r: R) {
      rows.set(r.id, r);
      add(r);
    },
  };
}
type ChildIndex = ReturnType<typeof childIndex<ChildRow>>;

/** The columns an update writes: a column missing from the file (`undefined`) is left
 *  as stored (ADR 0185 §2). */
function present<T extends object>(o: T): Present<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Present<T>;
}
/** `T` with each key that may be `undefined` made optional and defined. */
type Present<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

/** One property CSV row, reduced to what the plan needs. */
interface PropertyInput {
  line: number;
  name: string;
  /** The CSV columns an update writes. */
  fields: Partial<PropertyRow>;
  /** The full row an add inserts. */
  newRow: (id: string) => PropertyRow;
}

function propertyInputs(batch: CsvImportBatch): PropertyInput[] {
  return (batch.properties ?? []).map((p): PropertyInput => {
    const fields = present({
      address: p.address,
      type: p.type,
      size_m2: p.size_m2,
      garage: p.garage == null ? p.garage : p.garage ? 1 : 0,
      purchase_date: p.purchase_date,
      purchase_price: p.purchase_price,
      appreciation_override_pa: p.appreciation_override_pa,
      rent_index_override_pa: p.rent_index_override_pa,
      // ADR 0119 §8: a blank funding cell keeps the stored amount; a CSV sets or
      // changes a recorded figure, never erases it.
      own_cash: p.own_cash ?? undefined,
      transaction_costs: p.transaction_costs ?? undefined,
      initial_works: p.initial_works ?? undefined,
    });
    return {
      line: p.line,
      name: p.name,
      fields,
      newRow: (id): PropertyRow => ({
        id,
        name: p.name,
        // A column the file does not hold, or a blank cell, leaves the value unknown.
        address: null,
        type: null,
        size_m2: null,
        garage: null,
        appreciation_override_pa: null,
        rent_index_override_pa: null,
        own_cash: null,
        transaction_costs: null,
        initial_works: null,
        ...fields,
        active: 1,
        // ADR 0119 §8: the note is not a CSV column.
        funding_note: null,
      }),
    };
  });
}

/** One child CSV row, reduced to what the plan needs. */
interface ChildInput {
  file: keyof typeof CHILD_FILES;
  line: number;
  propertyName: string;
  /** The key date (`start_date` / `valid_from`). */
  date: string;
  /** The CSV columns an update writes. */
  fields: Partial<ChildRow>;
  /** The full row an add inserts. */
  newRow: (id: string, propertyId: string) => ChildRow;
}

function childInputs(batch: CsvImportBatch): ChildInput[] {
  return [
    ...(batch.mortgages ?? []).map((m): ChildInput => ({
      file: "mortgages",
      line: m.line,
      propertyName: m.property_name,
      date: m.start_date,
      fields: present({
        initial_principal: m.initial_principal,
        fixation_years: m.fixation_years,
        interest_rate_pa: m.interest_rate_pa,
        monthly_instalment: m.monthly_instalment,
        loan_term_years: m.loan_term_years,
        // Blank ⇒ keep the stored maturity (DR-129). Draws and the interest-only date
        // are not CSV columns, so they are never touched.
        contract_maturity_date: m.contract_maturity_date ?? undefined,
      }),
      newRow: (id, propertyId): MortgageBlockRow => ({
        id,
        property_id: propertyId,
        start_date: m.start_date,
        initial_principal: m.initial_principal,
        fixation_years: m.fixation_years,
        interest_rate_pa: m.interest_rate_pa,
        monthly_instalment: m.monthly_instalment,
        loan_term_years: m.loan_term_years ?? null,
        draws: null,
        interest_only_until: null,
        contract_maturity_date: m.contract_maturity_date ?? null,
        prepayments: null,
        recasts: null,
      }),
    })),
    ...(batch.valuations ?? []).map((v): ChildInput => {
      const fields = present({
        valid_to: v.valid_to,
        market_value: v.market_value,
      });
      return {
        file: "valuations",
        line: v.line,
        propertyName: v.property_name,
        date: v.valid_from,
        fields,
        newRow: (id, propertyId): ValuationRow => ({
          id,
          property_id: propertyId,
          valid_from: v.valid_from,
          valid_to: null,
          ...fields,
        }),
      };
    }),
    ...(batch.rents ?? []).map((r): ChildInput => {
      const fields = present({
        end_date: r.end_date,
        monthly_rent: r.monthly_rent,
      });
      return {
        file: "rents",
        line: r.line,
        propertyName: r.property_name,
        date: r.start_date,
        fields,
        newRow: (id, propertyId): LeaseRow => ({
          id,
          property_id: propertyId,
          start_date: r.start_date,
          end_date: null,
          ...fields,
        }),
      };
    }),
  ];
}

/** What an import would write, computed without touching the DB. */
export interface ImportPlan extends CsvImportPreview {
  statements: SqlStatement[];
}

/** The properties by name. A name matches the property spelled the same way first, then
 *  by Unicode form (ADR 0237): two stored names that differ only in form (a restore may
 *  hold them) each keep the rows spelled like them. */
function nameIndex(stored: Iterable<PropertyRow>) {
  const bySpelling = new Map<string, PropertyRow>();
  const byKey = new Map<string, PropertyRow>();
  const add = (p: PropertyRow) => {
    bySpelling.set(spellingKey(p.name), p);
    byKey.set(propertyKey(p.name), p);
  };
  for (const p of stored) add(p);
  return {
    add,
    find: (name: string) =>
      bySpelling.get(spellingKey(name)) ?? byKey.get(propertyKey(name)),
  };
}

/** The plan, built one CSV row at a time against the stored rows (D-55). */
class PlanBuilder {
  private readonly statements: SqlStatement[] = [];
  private readonly problems: CsvImportProblem[] = [];
  private readonly items: ImportItem[] = [];
  /** Which file line produced each written row, as `${entity}:${id}`. */
  private readonly origin = new Map<string, { file: CsvFile; row: number }>();
  private readonly tables: ImportTables;
  private readonly newPropertyId: (key: string) => string;
  // The stored rows, indexed once. A Map keeps a replaced row in its place and appends
  // a new one, so the merged tables keep the stored order.
  private readonly properties: Map<string, PropertyRow>;
  private readonly holdingCosts: HoldingCostRow[];
  private readonly children: {
    mortgage_blocks: ReturnType<typeof childIndex<MortgageBlockRow>>;
    valuations: ReturnType<typeof childIndex<ValuationRow>>;
    leases: ReturnType<typeof childIndex<LeaseRow>>;
  };
  private readonly names: ReturnType<typeof nameIndex>;
  private readonly withCosts: Set<string>;
  /** The mortgage blocks this import adds, by row id (ADR 0160). */
  private readonly addedBlocks = new Map<string, ImportItem>();

  constructor(tables: ImportTables, newPropertyId: (key: string) => string) {
    this.tables = tables;
    this.newPropertyId = newPropertyId;
    this.properties = new Map(tables.properties.map((r) => [r.id, r]));
    this.holdingCosts = [...tables.holding_costs];
    this.children = {
      mortgage_blocks: childIndex(tables.mortgage_blocks),
      valuations: childIndex(tables.valuations),
      leases: childIndex(tables.leases),
    };
    this.names = nameIndex(this.properties.values());
    this.withCosts = new Set(this.holdingCosts.map((h) => h.property_id));
  }

  /** The property a name matches, as it stands now: a later row may replace it. */
  private propertyNamed(name: string): PropertyRow | undefined {
    const id = this.names.find(name)?.id;
    return id === undefined ? undefined : this.properties.get(id);
  }

  /** Add or update a property. An existing property keeps its id, stored spelling and
   *  active flag; CSV doesn't model activation (D-55). */
  addProperty(p: PropertyInput): void {
    const existing = this.names.find(p.name);
    const { fields } = p;
    const row: PropertyRow = existing
      ? { ...existing, ...fields }
      : p.newRow(this.newPropertyId(propertyKey(p.name)));
    this.statements.push(
      existing
        ? updateStatement("properties", row.id, fields)
        : insertStatement("properties", row),
    );
    this.properties.set(row.id, row);
    this.names.add(row);
    this.origin.set(`property:${row.id}`, { file: "properties", row: p.line });
    const changes = existing ? changesOf(existing, fields) : [];
    this.items.push({
      file: "properties",
      row: p.line,
      kind: kindOf(existing, changes),
      propertyId: row.id,
      propertyName: row.name,
      date: null,
      changes,
    });
    // Every property gets a holding-costs row so the edit form works.
    if (!this.withCosts.has(row.id)) {
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
      this.statements.push(insertStatement("holding_costs", costs));
      this.holdingCosts.push(costs);
      this.withCosts.add(row.id);
    }
  }

  /** Update the child row with the same natural key, or insert a new one. */
  addChild(c: ChildInput): void {
    const { table, entity, tag } = CHILD_FILES[c.file];
    const property = this.propertyNamed(c.propertyName);
    if (property === undefined) {
      this.problems.push({
        file: c.file,
        row: c.line,
        field: "property_name",
        problem: { code: "unknownProperty", value: c.propertyName },
      });
      return;
    }
    const propId = property.id;
    const child: ChildIndex = this.children[table];
    const existing = child.find(propId, c.date);
    const changes = existing ? changesOf(existing, c.fields) : [];
    const at = { file: c.file, row: c.line };
    const item: ImportItem = {
      ...at,
      kind: kindOf(existing, changes),
      propertyId: propId,
      propertyName: property.name,
      date: c.date,
      changes,
    };
    this.items.push(item);
    let row: ChildRow;
    if (existing) {
      row = { ...existing, ...c.fields };
      this.statements.push(updateStatement(table, row.id, c.fields));
    } else {
      // A stored row whose date was edited after an earlier import keeps the id
      // generated from its old date; suffix a fresh id instead of clashing on the key
      // (DR-137).
      const base = `${propId}-csv-${tag}-${c.date}`;
      let id = base;
      for (let n = 2; child.rows.has(id); n++) id = `${base}-${n}`;
      row = c.newRow(id, propId);
      this.statements.push(insertStatement(table, row));
      if (entity === "mortgage") this.addedBlocks.set(id, item);
    }
    child.set(row);
    this.origin.set(`${entity}:${row.id}`, at);
  }

  /** With no problem so far, check the merged result against the engine's input rules
   *  and, when it passes, note what each added block does to its loan chain. */
  checkMerged(): void {
    if (this.problems.length > 0) return;
    const { children } = this;
    const db = {
      properties: [...this.properties.values()],
      mortgage_blocks: [...children.mortgage_blocks.rows.values()],
      valuations: [...children.valuations.rows.values()],
      leases: [...children.leases.rows.values()],
      holding_costs: this.holdingCosts,
    };
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
      const at = this.origin.get(`${e.entity}:${e.id}`);
      if (!at) continue;
      // A stored event is not a CSV column: name the event, not a field (ADR 0160).
      const date = storedEventDate(merged.mortgages, e);
      this.problems.push(
        date === undefined
          ? {
              ...at,
              field: e.field ? toColumn(e.field) : "",
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
    const { tables } = this;
    if (
      this.problems.length === 0 &&
      this.addedBlocks.size > 0 &&
      tables.assumptions
    )
      noteChainEffects(
        this.addedBlocks,
        tables.mortgage_blocks.map(rowToMortgageBlock),
        merged.mortgages,
        rowToAssumptions(tables.assumptions),
      );
  }

  result(): ImportPlan {
    const { statements, problems, items } = this;
    return { statements, problems, items };
  }
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
  const plan = new PlanBuilder(tables, newPropertyId);
  // Properties first (FK parent).
  for (const p of propertyInputs(batch)) plan.addProperty(p);
  for (const c of childInputs(batch)) plan.addChild(c);
  plan.checkMerged();
  return plan.result();
}
