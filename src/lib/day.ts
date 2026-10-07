// Calendar days at the UI boundary (ADR 0149). The engine is pure (no Date.now) and keeps
// every day as a Date at UTC midnight; "now", a picked calendar cell and a backup time
// stamp are local moments. Each crossing between the two goes through this module, so a
// time-zone fix is made once (DR-068, DR-072).

// The full-year builders. Date.UTC and `new Date(y, m, d)` map years 0–99 to 1900–1999.
// These are lib's twin of the engine's `utc()` (lib never imports the engine), one
// constructor per layer (ADR 0149 §5). month0 is 0-based.
function utcMidnight(year: number, month0: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month0, day);
  return date;
}
function localMidnightOf(year: number, month0: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month0, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** The local calendar day of `instant`, at UTC midnight (the engine's convention). */
export function localDay(instant: Date): Date {
  return utcMidnight(
    instant.getFullYear(),
    instant.getMonth(),
    instant.getDate(),
  );
}

/** The inverse of `localDay`: a UTC-midnight day as local midnight of the same day, for
 *  widgets that work in local time (the calendar popover). */
export function localMidnight(day: Date): Date {
  return localMidnightOf(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
  );
}

/** A UTC-midnight day as YYYY-MM-DD. */
export function isoDay(day: Date): string {
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day.getUTCDate()).padStart(2, "0");
  return `${day.getUTCFullYear()}-${mm}-${dd}`;
}

/** Today: the local calendar day of `now`. The UI-boundary clock; `now` is injectable for
 *  tests (DR-072). */
export function todayUtc(now: Date = new Date()): Date {
  return localDay(now);
}

/** The local calendar day of `now` as YYYY-MM-DD, for file names (DR-068): a backup
 *  saved at 00:30 in Prague is dated today, not yesterday (UTC). */
export function localIsoDay(now: Date = new Date()): string {
  return isoDay(localDay(now));
}

/** New dates start on 01.01.1900 (ADR 0149 §5, DR-035, UX-052): the forms and CSV import
 *  refuse an earlier one, which is almost certainly a typo. A stored one only warns. */
export const DATE_FLOOR_YEAR = 1900;

/** A UTC-midnight day before the floor. */
export const isEarlyDate = (day: Date): boolean =>
  day.getUTCFullYear() < DATE_FLOOR_YEAR;

/** A stored date field, named as on the engine type; a loan event list is named by the
 *  list (`draws`, `prepayments`, `recasts`). */
export type DateField =
  | "baseDate"
  | "purchaseDate"
  | "startDate"
  | "completionDate"
  | "contractMaturityDate"
  | "draws"
  | "prepayments"
  | "recasts"
  | "validFrom"
  | "validTo"
  | "endDate";

/** One stored date before the floor. */
export interface EarlyDateField {
  entity: "assumptions" | "property" | "mortgage" | "valuation" | "lease";
  id: string | undefined;
  field: DateField;
  /** The earliest early date in the field (a list can hold several). */
  date: Date;
}

/** Every stored date before the floor (ADR 0149 §5): the restore warning and the Data
 *  check. Structural types: lib never imports the engine, whose Portfolio and Assumptions
 *  fit. A field is listed once, with its earliest date. */
export function earlyDateFields(
  portfolio: {
    properties: readonly { id: string; purchaseDate: Date }[];
    mortgages: readonly {
      id: string;
      startDate: Date;
      completionDate?: Date | undefined;
      contractMaturityDate?: Date | undefined;
      draws?: readonly { date: Date }[] | undefined;
      prepayments?: readonly { date: Date }[] | undefined;
      recasts?:
        readonly { date: Date; maturity?: Date | undefined }[] | undefined;
    }[];
    valuations?: readonly {
      id: string;
      validFrom: Date;
      validTo?: Date | undefined;
    }[];
    leases?: readonly {
      id: string;
      startDate: Date;
      endDate?: Date | undefined;
    }[];
  },
  assumptions?: { baseDate: Date },
): EarlyDateField[] {
  const out: EarlyDateField[] = [];
  const check = (
    entity: EarlyDateField["entity"],
    id: string | undefined,
    field: DateField,
    dates: readonly (Date | undefined)[],
  ) => {
    const early = dates.filter(
      (d): d is Date => d !== undefined && isEarlyDate(d),
    );
    if (early.length === 0) return;
    const date = early.reduce((a, b) => (b.getTime() < a.getTime() ? b : a));
    out.push({ entity, id, field, date });
  };
  if (assumptions)
    check("assumptions", undefined, "baseDate", [assumptions.baseDate]);
  for (const p of portfolio.properties)
    check("property", p.id, "purchaseDate", [p.purchaseDate]);
  for (const m of portfolio.mortgages) {
    check("mortgage", m.id, "startDate", [m.startDate]);
    check("mortgage", m.id, "completionDate", [m.completionDate]);
    check("mortgage", m.id, "contractMaturityDate", [m.contractMaturityDate]);
    check(
      "mortgage",
      m.id,
      "draws",
      (m.draws ?? []).map((d) => d.date),
    );
    check(
      "mortgage",
      m.id,
      "prepayments",
      (m.prepayments ?? []).map((p) => p.date),
    );
    check(
      "mortgage",
      m.id,
      "recasts",
      (m.recasts ?? []).flatMap((r) => [r.date, r.maturity]),
    );
  }
  for (const v of portfolio.valuations ?? []) {
    check("valuation", v.id, "validFrom", [v.validFrom]);
    check("valuation", v.id, "validTo", [v.validTo]);
  }
  for (const l of portfolio.leases ?? []) {
    check("lease", l.id, "startDate", [l.startDate]);
    check("lease", l.id, "endDate", [l.endDate]);
  }
  return out;
}
