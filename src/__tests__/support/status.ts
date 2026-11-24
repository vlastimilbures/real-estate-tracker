// The start-up fields #467 folded into the store's one `status`, read back for the
// tests that assert them: `statusOf` names both error screens "error".
import type { PortfolioState } from "../../state/portfolio/types";
import { refusedOf, writesRefused } from "../../state/portfolio/status";

type State = Pick<PortfolioState, "status">;

/** "idle", "loading", "ready", or "error" on either error screen. */
export const statusOf = ({ status }: State) =>
  status.kind === "startupFailed" || status.kind === "readBackFailed"
    ? "error"
    : status.kind;

/** The typed data-layer failure that stopped startup, if any (P5a). */
export const startupErrorOf = ({ status }: State) =>
  status.kind === "startupFailed" ? status.startup : null;

/** The startup failure on its screen, else the banner's error: the old `error`. */
export const errorOf = (s: Pick<PortfolioState, "status" | "error">) =>
  s.status.kind === "startupFailed" ? s.status.error : s.error;

/** Writes are refused after a failed read-back, also while Try again runs (ADR 0228). */
export const readBackFailedOf = ({ status }: State) => writesRefused(status);

/** The writes refused since the read-back failed (ADR 0255). */
export const refusedWritesOf = ({ status }: State) => refusedOf(status);
