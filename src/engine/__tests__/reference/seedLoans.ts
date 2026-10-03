// The three seed loans (engine-parity.md) expressed as reference-model inputs.
import type { Iso, RefLoan } from "./mortgageReference";

export const BASE: Iso = "2026-06-07";
export const RESET = "0.045";

export const SEED_LOANS: Record<string, RefLoan> = {
  javorova: {
    start: "2021-01-17",
    principal: "1912500",
    ratePa: "0.0169",
    instalment: "6721.8",
    fixationMonths: 120,
  },
  lipova: {
    start: "2022-01-15",
    principal: "5610000",
    ratePa: "0.0359",
    instalment: "25567.15",
    fixationMonths: 84,
  },
  dubova: {
    start: "2024-03-12",
    principal: "3034500",
    ratePa: "0.0449",
    instalment: "21576.4",
    fixationMonths: 84,
  },
};
