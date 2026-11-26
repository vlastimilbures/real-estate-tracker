// Display currency. Amounts are always CZK: the engine, the DB and the parity targets
// are in CZK, and the app shows Kč only: amounts are never converted, so there is no
// currency picker (ADR 0058). Number style is Czech (space thousands, comma decimal).

export const CZK = {
  /** Suffix appended to whole amounts. */
  symbol: "Kč",
  /** Axis/hero label for millions. */
  millionsLabel: "M Kč",
} as const;
