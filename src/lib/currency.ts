// Display currency. Amounts are always CZK: the engine, the DB and the parity targets
// are in CZK, and the app shows Kč only (UX-017, Q-04 — the old €/$/£ picker relabelled
// amounts without converting them). Number style is Czech (space thousands, comma decimal).

export const CZK = {
  /** Suffix appended to whole amounts. */
  symbol: "Kč",
  /** Axis/hero label for millions. */
  millionsLabel: "M Kč",
} as const;
