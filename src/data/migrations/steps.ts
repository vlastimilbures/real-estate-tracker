// The schema steps after the version 8 baseline (#472: split out of the runner), one per
// version, each applied in its own transaction by the runner in index.ts.

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const nonNegative = (c: string) => `${c} NOT GLOB '-*'`;
const unitRate = (c: string) => `CAST(${c} AS REAL) BETWEEN 0 AND 1`;

/** The steps after the baseline, in order. */
export const MIGRATIONS: Migration[] = [
  {
    version: 9,
    name: "mortgage prepayments and recasts",
    // ADR 0109: nullable JSON lists, like `draws`. `prepayments` holds [{date, amount,
    // effect, fee?}], `recasts` holds [{date, maturity} | {date, instalment}]. NULL = none,
    // so every stored loan keeps its numbers. Each column carries its JSON check.
    sql: `
      ALTER TABLE mortgage_blocks ADD COLUMN prepayments TEXT
        CONSTRAINT mortgage_prepayments_json CHECK (json_valid(prepayments));
      ALTER TABLE mortgage_blocks ADD COLUMN recasts TEXT
        CONSTRAINT mortgage_recasts_json CHECK (json_valid(recasts));
    `,
  },
  {
    version: 10,
    name: "property acquisition funding",
    // ADR 0119: the owner's funding record, every part nullable. NULL = unknown (never
    // backfilled), so every stored property keeps its numbers. Money as TEXT with the
    // textual sign check of the baseline's money columns.
    sql: `
      ALTER TABLE properties ADD COLUMN own_cash TEXT
        CONSTRAINT property_own_cash_not_negative CHECK (${nonNegative("own_cash")});
      ALTER TABLE properties ADD COLUMN transaction_costs TEXT
        CONSTRAINT property_transaction_costs_not_negative CHECK (${nonNegative("transaction_costs")});
      ALTER TABLE properties ADD COLUMN initial_works TEXT
        CONSTRAINT property_initial_works_not_negative CHECK (${nonNegative("initial_works")});
      ALTER TABLE properties ADD COLUMN funding_note TEXT;
    `,
  },
  {
    version: 11,
    name: "assumptions selling costs",
    // ADR 0183: the selling-cost rate of a sale at the horizon (levered IRR only). NOT NULL
    // like every assumptions column; DEFAULT '0' fills the one existing row, so the
    // owner's numbers do not change. A rate as TEXT with the 0–1 check of the baseline's
    // rates.
    sql: `
      ALTER TABLE assumptions ADD COLUMN selling_cost_pct TEXT NOT NULL DEFAULT '0' CONSTRAINT assumptions_selling_cost_0_to_1 CHECK (${unitRate("selling_cost_pct")});
    `,
  },
];
