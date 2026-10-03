// Display currency. Amounts are always CZK: the engine, the DB and the parity targets
// are in CZK, and the app shows Kč only (UX-017, Q-04 — the old €/$/£ picker relabelled
// amounts without converting them). Number style is Czech (space thousands, comma decimal).

export interface CurrencySpec {
  code: "CZK";
  /** Suffix appended to whole amounts. */
  symbol: string;
  /** Axis/hero label for millions. */
  millionsLabel: string;
}

const CZK: CurrencySpec = {
  code: "CZK",
  symbol: "Kč",
  millionsLabel: "M Kč",
};

export function getActiveCurrency(): CurrencySpec {
  return CZK;
}

/** Convenience for form-field suffixes. */
export function currencySymbol(): string {
  return CZK.symbol;
}
