// Reading the store's start-up state: whether writes are refused, and which.
import type { RefusedWrite } from "../writeTargets";
import type { Status } from "./types";

/** The start-up states that refuse writes, each with the writes refused so far. */
type RefusingStatus =
  | { kind: "loading"; refused: RefusedWrite[] }
  | Extract<Status, { kind: "readBackFailed" }>;

/** A read-back failed and Try again has not yet read the data: the screen may be older
 *  than the database, so writes are refused (ADR 0228). Stays true while Try again runs. */
export function writesRefused(status: Status): status is RefusingStatus {
  return (
    status.kind === "readBackFailed" ||
    (status.kind === "loading" && status.refused !== undefined)
  );
}

/** The writes refused since a read-back failed, for the error screen (ADR 0255). */
export function refusedOf(status: Status): RefusedWrite[] {
  return writesRefused(status) ? status.refused : [];
}
