// Branded boundary types for the engine API (D-25, ADR 0074): `IsoDate`, `Rate` and
// `Money`. A brand is a compile-time tag only — at runtime an IsoDate is a plain `Date`
// and a Rate or Money a plain `Decimal`, so branding never changes a computed number.
// Values get a brand only through the constructors below (dates: `utc` / `isoDate` /
// `edate` / `addYears` in ./dates), which is what keeps a local-time `Date` out of a date
// field and a rate out of a Kč field (and the reverse). Arithmetic on a Rate or Money
// returns a plain Decimal by design; outputs stay Decimal.
import { D, type Decimal, type Numeric } from "../lib/money";

declare const isoDateBrand: unique symbol;
declare const rateBrand: unique symbol;
declare const moneyBrand: unique symbol;

/** A calendar day, stored as a `Date` at UTC midnight (see ./dates). */
export type IsoDate = Date & { readonly [isoDateBrand]: true };

/** A rate or fraction (0.045 = 4.5 %): interest, growth, vacancy, cost shares. */
export type Rate = Decimal & { readonly [rateBrand]: true };

/** Brand a number/string/Decimal as a rate. Does not validate the range. */
export function rate(value: Numeric): Rate {
  return D(value) as Rate;
}

/** A Kč amount on an engine input: price, value, rent, principal, instalment, costs,
 *  draws (ADR 0074). */
export type Money = Decimal & { readonly [moneyBrand]: true };

/** Brand a number/string/Decimal as money. Does not validate the range. */
export function money(value: Numeric): Money {
  return D(value) as Money;
}
