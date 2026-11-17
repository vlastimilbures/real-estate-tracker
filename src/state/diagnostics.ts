// The UI's door to error logging and to the data layer's error classes (ADR 0072, DR-163).
// Re-exports only.
export { logFailure, type FailureSite } from "../data/errorLog";
export { READ_FAILURES } from "../data/errors";
