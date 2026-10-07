// The UI's door to error logging and error text (ADR 0072, DR-163). Re-exports only.
export { logFailure, type FailureSite } from "../data/errorLog";
export { messageOf } from "../data/errors";
