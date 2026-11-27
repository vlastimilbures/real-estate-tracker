// What the startup error screen is told about a typed startup failure (ADR 0153): the
// DataError's code and details, how far a stopped upgrade got, and which Rust code refused
// the copy (ADR 0271). Null for an untyped failure.
import { DataError } from "../../data/errors";
import type { StartupError } from "./types";

export function toStartupError(e: unknown): StartupError | null {
  if (!(e instanceof DataError)) return null;
  return {
    code: e.code,
    details: e.details,
    ...(e.upgrade && { upgrade: e.upgrade }),
    ...(e.failedCommand && { failedCommand: e.failedCommand }),
  };
}
