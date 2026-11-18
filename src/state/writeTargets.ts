// What a write changes, so a write refused after a failed read-back can be named on the
// error screen (ADR 0255).

/** A data table, by its backup table key (`backup.tables.*`). */
export type WriteTable =
  | "properties"
  | "mortgage_blocks"
  | "valuations"
  | "leases"
  | "holding_costs"
  | "assumptions"
  | "scenarios";

/** A table, a whole-database action, or what the screen leaves out. */
export type WriteTarget = RefusedWrite | "bookkeeping";

/** A write the screen names when it is refused: everything but `bookkeeping` (recording
 *  an export, dismissing the sample banner). */
export type RefusedWrite =
  WriteTable | "importCsv" | "restore" | "clearSample" | "loadSample";
