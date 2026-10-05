// Independent reference model for the mortgage engine (P02 audit, TEST-ONLY).
//
// A deliberately simple, line-by-line monthly amortization written from the Czech
// retail-mortgage description (anuitní splácení, fixace → refixace, čerpání po
// částech), NOT from the engine code. It must never import from src/engine or
// src/lib: it uses its own Decimal clone (so it does not inherit lib/money.ts's
// global config), its own ISO-date helpers and its own annuity maths. Its purpose is
// to cross-check the engine and to quantify candidate Czech-practice changes.
//
// Conventions of the "truth" model:
//   • monthly rate = nominal annual rate ÷ 12 (30/360-style, one period per month);
//   • payment k falls on EDATE(start, k) (the loan's own payment day, end-of-month
//     clamped); a payment is "made by" a date when its due date is on/before it;
//   • the fixed rate applies to every payment due on/before the fixation end
//     (start + fixationMonths); later payments use the reset rate (± rate shock);
//   • a development loan pays interest only on every payment due on/before its
//     completion date (ADR 0129 §2);
//   • on any rate change, the end of interest-only, or a tranche draw, the instalment
//     re-amortizes the balance over the payments left to the (implied) maturity
//     start + term (constant maturity); between those events the instalment holds;
//   • a development loan starts from its entered instalment, or (D-31, option
//     `devInstalment: "fromTerm"`) from the annuity of its principal over the term;
//   • draws on/before the loan start join the opening principal; later draws join the
//     balance of the payment period they land in;
//   • the payment due at maturity (payment number = term) clears the balance.
import DecimalJs from "decimal.js";

const Dec = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
});
type Dec = DecimalJs;
type Value = DecimalJs.Value;

const d = (v: Value): Dec => new Dec(v);
const ZERO = d(0);
const ONE = d(1);

// ---------------------------------------------------------------------------
// ISO dates (YYYY-MM-DD strings; lexicographic order = chronological order)
// ---------------------------------------------------------------------------

export type Iso = string;

function parts(s: Iso): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new RangeError(`Not an ISO date: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function daysInMonth(y: number, m1: number): number {
  if (m1 === 2)
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m1) ? 30 : 31;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Add calendar months, clamping the day to the target month's length. */
export function addMonths(s: Iso, n: number): Iso {
  const [y, m, day] = parts(s);
  const idx = y * 12 + (m - 1) + n;
  const ty = Math.floor(idx / 12);
  const tm = idx - ty * 12 + 1;
  return `${pad(ty, 4)}-${pad(tm, 2)}-${pad(Math.min(day, daysInMonth(ty, tm)), 2)}`;
}

/** Number of payments k ≥ 1 with due date addMonths(start, k) on/before `date`. */
export function paymentsMadeBy(start: Iso, date: Iso): number {
  let k = 0;
  while (addMonths(start, k + 1) <= date) k++;
  return k;
}

// ---------------------------------------------------------------------------
// Annuity maths (own closed forms)
// ---------------------------------------------------------------------------

/** Level payment amortizing `pv` over `n` periods at periodic rate `r`. */
export function annuityPayment(r: Value, n: number, pv: Value): Dec {
  const rate = d(r);
  const principal = d(pv);
  if (rate.isZero()) return principal.div(n);
  return principal.times(rate).div(ONE.minus(ONE.plus(rate).pow(-n)));
}

/** Fractional number of periods for `payment` to retire `pv` at periodic rate `r`. */
export function annuityPeriods(r: Value, payment: Value, pv: Value): Dec {
  const rate = d(r);
  const a = d(payment);
  const p = d(pv);
  if (!a.isPositive() || a.isZero()) {
    throw new RangeError("Instalment must be positive.");
  }
  if (rate.isZero()) return p.div(a);
  if (a.lessThanOrEqualTo(p.times(rate))) {
    throw new RangeError(
      "Instalment ≤ first-month interest: the loan never amortizes.",
    );
  }
  return ONE.minus(rate.times(p).div(a))
    .ln()
    .negated()
    .div(ONE.plus(rate).ln());
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface RefDraw {
  date: Iso;
  amount: Value;
}

/** An extra principal payment (mimořádná splátka, ADR 0109): paid right after the
 *  first payment due on/after its date. The bank then either lowers the instalment
 *  (same maturity) or keeps it (earlier maturity). */
export interface RefPrepayment {
  date: Iso;
  amount: Value;
  effect: "lowerInstalment" | "shortenTerm";
  fee?: Value;
}

/** A change of maturity agreed with the bank (ADR 0109), from the payment after the
 *  first payment due on/after its date: a new last-payment date, or a new instalment. */
export type RefRecast =
  { date: Iso; maturity: Iso } | { date: Iso; instalment: Value };

export interface RefLoan {
  start: Iso;
  principal: Value;
  ratePa: Value;
  instalment: Value;
  fixationMonths: number;
  /** Explicit term; when absent it is derived as ceil(NPER) from the instalment (D-08). */
  termMonths?: number;
  draws?: RefDraw[];
  /** Interest-only on every payment due on/before this date. */
  completion?: Iso;
  prepayments?: RefPrepayment[];
  recasts?: RefRecast[];
}

/** A recast may not run past 50 years from the start, unless the contract is longer. */
const REF_MAX_TERM = 600;

/** Payment number k of the first payment due on/after `date` (ADR 0109). */
export function firstPaymentOnOrAfter(start: Iso, date: Iso): number {
  let k = 1;
  while (addMonths(start, k) < date) k++;
  return k;
}

export interface RefRateShock {
  deltaPa: Value;
  months: number;
  /** Window start: each loan's fixation end (engine today) or the base date. */
  anchor: "fixationEnd" | "baseDate";
}

export interface RefOptions {
  baseDate: Iso;
  /** Rows to emit after baseDate. */
  months: number;
  resetRatePa: Value;
  /**
   * baseDateGrid — rows on EDATE(baseDate, m), the rate read on the grid date
   *   (J-03 a, ADR 0021);
   * gridDueDate — rows on EDATE(baseDate, m), but the rate read on the due date of
   *   the payment the row carries, EDATE(start, k) (J-03 a′, D-21: the engine);
   * paymentDay — rows on the loan's own payment dates after baseDate (J-03 b).
   */
  calendar?: "baseDateGrid" | "gridDueDate" | "paymentDay";
  /** Rounding of a re-amortized instalment (J-01). The entered instalment is kept. */
  rounding?: "none" | "ceil" | "halfUp";
  /** Round each month's interest to this many decimals (e.g. 2 = haléře). */
  interestDecimals?: number;
  rateShock?: RefRateShock;
  /** When a tranche re-amortizes the instalment (J-06). */
  drawTiming?: "landing" | "nextMonth";
  /** A development loan's opening instalment: the entered one (P02 evidence), or the
   *  annuity of the principal over the term at the start rate (D-31, the engine). */
  devInstalment?: "entered" | "fromTerm";
  /** A running loan's tranche dated after its last payment due by baseDate (and
   *  on/before baseDate): folded into the opening balance with no re-amortization (P02
   *  evidence), or carried into the next payment period, where it re-amortizes like any
   *  tranche (D-41, the engine). For a future loan, "nextPeriod" also sizes the opening
   *  instalment on a tranche that lands with the first draw (D-46); "fold" keeps the
   *  instalment on the principal alone. */
  openingDraws?: "fold" | "nextPeriod";
}

export interface RefRow {
  month: number;
  date: Iso;
  ratePa: Dec;
  /** Scheduled instalment in force (the interest in an interest-only month). */
  instalment: Dec;
  interest: Dec;
  principal: Dec;
  /** Cash actually paid: interest + principal (differs from instalment at payoff). */
  payment: Dec;
  draw: Dec;
  /** Extra principal paid after this period's payment, and its fee (ADR 0109). */
  prepaid: Dec;
  fee: Dec;
  endBalance: Dec;
}

function isDev(loan: RefLoan): boolean {
  return (loan.draws?.length ?? 0) > 0 || loan.completion != null;
}

/** Term in months: explicit, or ceil(NPER) of the entered instalment (D-08). */
export function termOf(loan: RefLoan): number {
  if (loan.termMonths != null) {
    if (!Number.isInteger(loan.termMonths) || loan.termMonths <= 0) {
      throw new RangeError(`Invalid term: ${loan.termMonths}`);
    }
    return loan.termMonths;
  }
  if (isDev(loan)) {
    throw new RangeError("A development loan needs an explicit term.");
  }
  const n = annuityPeriods(
    d(loan.ratePa).div(12),
    loan.instalment,
    loan.principal,
  );
  return n.ceil().toNumber();
}

/** Implied maturity (date of the last scheduled payment). */
export function impliedMaturity(loan: RefLoan): Iso {
  return addMonths(loan.start, termOf(loan));
}

function validate(loan: RefLoan): void {
  parts(loan.start);
  if (!d(loan.principal).isPositive() || d(loan.principal).isZero()) {
    throw new RangeError("Principal must be positive.");
  }
  if (d(loan.ratePa).isNegative()) throw new RangeError("Negative rate.");
  if (!isDev(loan)) {
    // The entered instalment must at least cover the first month's interest.
    const firstInterest = d(loan.principal).times(d(loan.ratePa).div(12));
    if (d(loan.instalment).lessThanOrEqualTo(firstInterest)) {
      throw new RangeError(
        "Instalment ≤ first-month interest: the loan never amortizes.",
      );
    }
  }
  termOf(loan);
}

export function referenceSchedule(loan: RefLoan, opts: RefOptions): RefRow[] {
  validate(loan);
  const term = termOf(loan);
  const base = opts.baseDate;
  const calendar = opts.calendar ?? "baseDateGrid";
  const rounding = opts.rounding ?? "none";
  const drawTiming = opts.drawTiming ?? "landing";
  const onGrid = calendar !== "paymentDay";
  /** Where the rate of payment `k` is read on the grid calendars. */
  const gridRateDate = (gridDate: Iso, k: number): Iso =>
    calendar === "gridDueDate" ? addMonths(loan.start, k) : gridDate;
  const fixEnd = addMonths(loan.start, loan.fixationMonths);
  const reset = d(opts.resetRatePa);
  const shock = opts.rateShock;
  const shockEnd = shock
    ? addMonths(shock.anchor === "baseDate" ? base : fixEnd, shock.months)
    : undefined;
  const draws = [...(loan.draws ?? [])].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  const drawsIn = (after: Iso, upTo: Iso) =>
    draws
      .filter((x) => x.date > after && x.date <= upTo)
      .reduce((s, x) => s.plus(x.amount), ZERO);
  const drawsUpTo = (upTo: Iso) =>
    draws
      .filter((x) => x.date <= upTo)
      .reduce((s, x) => s.plus(x.amount), ZERO);

  const rateAt = (date: Iso): Dec => {
    if (date <= fixEnd) return d(loan.ratePa);
    // A scenario shock reprices only payments due after baseDate (DR-117).
    if (shock && shockEnd && date > base && date <= shockEnd)
      return reset.plus(shock.deltaPa);
    return reset;
  };
  const ioAt = (date: Iso) =>
    loan.completion != null && date <= loan.completion;
  const roundInterest = (x: Dec) =>
    opts.interestDecimals == null
      ? x
      : x.toDecimalPlaces(opts.interestDecimals, DecimalJs.ROUND_HALF_UP);
  const roundInstalment = (x: Dec) =>
    rounding === "ceil"
      ? x.toDecimalPlaces(0, DecimalJs.ROUND_CEIL)
      : rounding === "halfUp"
        ? x.toDecimalPlaces(0, DecimalJs.ROUND_HALF_UP)
        : x;

  // Running state.
  let balance = ZERO;
  let instalment =
    isDev(loan) && opts.devInstalment === "fromTerm"
      ? annuityPayment(d(loan.ratePa).div(12), term, loan.principal)
      : d(loan.instalment);
  let prevRate = d(loan.ratePa);
  let prevIo = ioAt(loan.start);
  let pending = false;
  // ADR 0109: the last payment number in force (prepayments and recasts move it), a
  // re-amortization owed at the next payment, and an agreed instalment for it.
  let maturity = term;
  let reamortizeNext = false;
  let agreedInstalment: Dec | null = null;
  // ADR 0129 §1: late tranches a late-window event already counted in the terms it
  // set; the next payment's draw holds them but they are not a new tranche again.
  let known = ZERO;

  /** One payment period ending on `date`; `k` = payment number since loan start.
   *  The rate and interest-only are read on `rateDate` (the grid date, unless J-03 a′
   *  keys them on the due date; ADR 0129 §2). Draws stay on `date`. */
  const step = (
    date: Iso,
    k: number,
    draw: Dec,
    month: number,
    rateDate: Iso = date,
  ): RefRow => {
    balance = balance.plus(draw);
    const fresh = Dec.max(draw.minus(known), ZERO);
    known = ZERO;
    const ratePa = rateAt(rateDate);
    const r = ratePa.div(12);
    const io = ioAt(rateDate);
    const zero = (): RefRow => ({
      month,
      date,
      ratePa,
      instalment: ZERO,
      interest: ZERO,
      principal: ZERO,
      payment: ZERO,
      draw,
      prepaid: ZERO,
      fee: ZERO,
      endBalance: balance,
    });
    if (!balance.greaterThan(ZERO)) {
      prevRate = ratePa;
      prevIo = io;
      return zero();
    }
    if (io) {
      const interest = roundInterest(balance.times(r));
      prevRate = ratePa;
      prevIo = io;
      return {
        month,
        date,
        ratePa,
        instalment: interest,
        interest,
        principal: ZERO,
        payment: interest,
        draw,
        prepaid: ZERO,
        fee: ZERO,
        endBalance: balance,
      };
    }
    // A tranche on or after the maturity in force goes back to the contract term (ADR 0116).
    if (fresh.greaterThan(ZERO) && k >= maturity)
      maturity = Math.max(maturity, term);
    let trigger = (prevIo && !io) || !ratePa.equals(prevRate) || reamortizeNext;
    if (draw.greaterThan(ZERO) && drawTiming === "landing") trigger = true;
    if (drawTiming === "nextMonth") {
      if (pending) trigger = true;
      pending = draw.greaterThan(ZERO) && !trigger;
    }
    // ADR 0120: a tranche landing on the agreed instalment's payment does not change
    // that payment; the next payment re-amortizes over the maturity in force (in either
    // draw timing; with "nextMonth" a pending tranche would re-amortize there anyway).
    const owedNext = agreedInstalment !== null && fresh.greaterThan(ZERO);
    if (agreedInstalment) {
      // ADR 0137: the agreed instalment pays at least the month's interest.
      instalment = Dec.max(agreedInstalment, roundInterest(balance.times(r)));
    } else if (trigger) {
      const remaining = maturity - (k - 1);
      instalment =
        remaining > 0
          ? roundInstalment(annuityPayment(r, remaining, balance))
          : balance.plus(balance.times(r));
    }
    reamortizeNext = owedNext;
    agreedInstalment = null;
    const interest = roundInterest(balance.times(r));
    let principal = instalment.minus(interest);
    if (principal.isNegative()) principal = ZERO;
    // The payment at (or after) maturity clears the balance, whatever residual
    // rounding or arithmetic left behind.
    if (principal.greaterThan(balance) || k >= maturity) principal = balance;
    balance = balance.minus(principal);
    prevRate = ratePa;
    prevIo = io;
    return {
      month,
      date,
      ratePa,
      instalment,
      interest,
      principal,
      payment: interest.plus(principal),
      draw,
      prepaid: ZERO,
      fee: ZERO,
      endBalance: balance,
    };
  };

  // ADR 0109: prepayments and recasts, each tied to the payment it follows.
  type Pending = { k: number; date: Iso; done: boolean };
  const prepays = (loan.prepayments ?? [])
    .map((p) => ({ ...p, k: firstPaymentOnOrAfter(loan.start, p.date) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((p): RefPrepayment & Pending => ({ ...p, done: false }));
  const recasts = (loan.recasts ?? [])
    .map((r) => ({ ...r, k: firstPaymentOnOrAfter(loan.start, r.date) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((r): RefRecast & Pending => ({ ...r, done: false }));

  /** Apply one recast after payment k, on the balance `owed`; false when ignored. */
  const recast = (r: RefRecast, k: number, owed: Dec): boolean => {
    if ("maturity" in r) {
      maturity = paymentsMadeBy(loan.start, r.maturity);
      reamortizeNext = true;
      agreedInstalment = null;
      return true;
    }
    const a = d(r.instalment);
    const rNext = rateAt(addMonths(loan.start, k + 1)).div(12);
    if (a.lessThanOrEqualTo(owed.times(rNext))) return false; // never repays: ignored
    const last = k + annuityPeriods(rNext, a, owed).ceil().toNumber();
    const cap = Math.max(REF_MAX_TERM, term);
    if (last > cap) {
      maturity = cap;
      reamortizeNext = true;
      agreedInstalment = null;
    } else {
      maturity = last;
      reamortizeNext = false;
      agreedInstalment = a;
    }
    return true;
  };

  /** After payment k (row `row`): the prepayments, then the recasts, that `due` picks.
   *  Each event owes the balance plus the not-yet-added tranches `seen` dates on or
   *  before it (ADR 0129 §1: the late window); `balance` itself stays without them.
   *  The tranches behind the terms the events set become `known` to the next payment. */
  const settle = (
    row: RefRow,
    k: number,
    due: (e: Pending) => boolean,
    seen: (date: Iso) => Dec = () => ZERO,
  ): RefRow => {
    let prepaid = ZERO;
    let fee = ZERO;
    let effect: RefPrepayment["effect"] | null = null;
    let effectSeen = ZERO;
    for (const p of prepays.filter((e) => !e.done && due(e))) {
      p.done = true;
      const applied = Dec.min(d(p.amount), balance.plus(seen(p.date)));
      if (!applied.greaterThan(ZERO)) continue;
      balance = balance.minus(applied);
      prepaid = prepaid.plus(applied);
      fee = fee.plus(p.fee ?? 0);
      effect = p.effect;
      effectSeen = seen(p.date);
    }
    const owedAfter = balance.plus(effectSeen);
    let counted = ZERO;
    // shortenTerm keeps the instalment the next payment pays: an agreed one still to
    // pay (a recast settled before it, after payment k) at payment k+1's rate (ADR 0136).
    const kept = agreedInstalment ?? row.instalment;
    const keptRate = agreedInstalment
      ? rateAt(addMonths(loan.start, k + 1)).div(12)
      : row.ratePa.div(12);
    // `prevIo`: whether payment k (just made) was interest-only (ADR 0129 §2).
    if (effect && owedAfter.greaterThan(ZERO) && !prevIo) {
      if (effect === "lowerInstalment") {
        reamortizeNext = true;
        counted = effectSeen;
      } else if (kept.greaterThan(owedAfter.times(keptRate))) {
        // An instalment that does not cover the interest has no NPER: no change.
        const n = annuityPeriods(keptRate, kept, owedAfter);
        maturity = Math.min(maturity, k + n.ceil().toNumber());
        counted = effectSeen;
      }
    }
    for (const r of recasts.filter((e) => !e.done && due(e))) {
      r.done = true;
      const owed = balance.plus(seen(r.date));
      if (owed.greaterThan(ZERO) && recast(r, k, owed)) counted = seen(r.date);
    }
    if (counted.greaterThan(ZERO)) known = counted;
    return prepaid.isZero() && fee.isZero()
      ? { ...row, endBalance: balance }
      : { ...row, prepaid, fee, endBalance: balance };
  };
  const at = (k: number) => (e: Pending) => e.k === k;

  const rows: RefRow[] = [];

  if (loan.start <= base) {
    // Opening state: replay every payment already due on/before baseDate.
    balance = d(loan.principal).plus(drawsUpTo(loan.start));
    const n = paymentsMadeBy(loan.start, base);
    let prev = loan.start;
    let last: RefRow | undefined;
    for (let k = 1; k <= n; k++) {
      const date = addMonths(loan.start, k);
      last = settle(step(date, k, drawsIn(prev, date), 0), k, at(k));
      prev = date;
    }
    // Events dated after the last payment due and on/before baseDate are history too:
    // they follow that payment (or the start, when none is due yet), owing the
    // tranches drawn since that payment up to their own date.
    const lastDue = prev;
    settle(
      last ?? {
        month: 0,
        date: loan.start,
        ratePa: d(loan.ratePa),
        instalment,
        interest: ZERO,
        principal: ZERO,
        payment: ZERO,
        draw: ZERO,
        prepaid: ZERO,
        fee: ZERO,
        endBalance: balance,
      },
      n,
      (e) => e.date <= base,
      (date) => drawsIn(lastDue, date),
    );
    // Tranches between the last payment and baseDate: folded into the opening
    // balance, or (D-41) carried into the next payment period.
    const late = drawsIn(prev, base);
    const carry = opts.openingDraws === "nextPeriod";
    if (!carry) balance = balance.plus(late);
    if (onGrid) {
      for (let m = 1; m <= opts.months; m++) {
        const date = addMonths(base, m);
        const draw = drawsIn(addMonths(base, m - 1), date);
        const withLate = m === 1 && carry ? draw.plus(late) : draw;
        const k = n + m;
        rows.push(
          settle(step(date, k, withLate, m, gridRateDate(date, k)), k, at(k)),
        );
      }
    } else {
      let prevDate = carry ? prev : base;
      for (let m = 1; m <= opts.months; m++) {
        const date = addMonths(loan.start, n + m);
        const k = n + m;
        rows.push(settle(step(date, k, drawsIn(prevDate, date), m), k, at(k)));
        prevDate = date;
      }
    }
    return rows;
  }

  // Future loan: nothing owed until the start date.
  if (onGrid) {
    // Engine convention: drawn on the first grid date on/after start (no payment
    // that month); payments from the next grid month.
    let drawnAt = 0;
    for (let m = 1; m <= opts.months; m++) {
      const date = addMonths(base, m);
      if (drawnAt === 0) {
        if (date < loan.start) {
          rows.push({
            month: m,
            date,
            ratePa: d(loan.ratePa),
            instalment: ZERO,
            interest: ZERO,
            principal: ZERO,
            payment: ZERO,
            draw: ZERO,
            prepaid: ZERO,
            fee: ZERO,
            endBalance: ZERO,
          });
          continue;
        }
        drawnAt = m;
        balance = d(loan.principal).plus(drawsUpTo(date));
        // D-46: a tranche landing with the first draw re-amortizes over the full term.
        if (
          opts.openingDraws === "nextPeriod" &&
          isDev(loan) &&
          opts.devInstalment === "fromTerm"
        ) {
          instalment = annuityPayment(d(loan.ratePa).div(12), term, balance);
        }
        prevIo = ioAt(gridRateDate(date, 0));
        rows.push({
          month: m,
          date,
          ratePa: d(loan.ratePa),
          instalment: ZERO,
          interest: ZERO,
          principal: ZERO,
          payment: ZERO,
          draw: balance,
          prepaid: ZERO,
          fee: ZERO,
          endBalance: balance,
        });
        continue;
      }
      const draw = drawsIn(addMonths(base, m - 1), date);
      const k = m - drawnAt;
      rows.push(
        settle(step(date, k, draw, m, gridRateDate(date, k)), k, at(k)),
      );
    }
    return rows;
  }
  balance = d(loan.principal).plus(drawsUpTo(loan.start));
  let prevDate = loan.start;
  for (let m = 1; m <= opts.months; m++) {
    const date = addMonths(loan.start, m);
    rows.push(settle(step(date, m, drawsIn(prevDate, date), m), m, at(m)));
    prevDate = date;
  }
  return rows;
}

/**
 * Balance after every payment due on/before `asOf`, replayed on the loan's own
 * calendar with the fixation reset (the "true" balance at any date).
 */
export function referenceBalanceAt(
  loan: RefLoan,
  opts: Omit<RefOptions, "months" | "calendar" | "baseDate">,
  asOf: Iso,
): Dec {
  if (asOf < loan.start) return ZERO;
  const n = paymentsMadeBy(loan.start, asOf);
  if (n === 0) {
    return d(loan.principal).plus(
      (loan.draws ?? [])
        .filter((x) => x.date <= asOf)
        .reduce((s, x) => s.plus(x.amount), ZERO),
    );
  }
  const rows = referenceSchedule(loan, {
    ...opts,
    baseDate: loan.start,
    months: n,
    calendar: "paymentDay",
  });
  return rows[n - 1].endBalance;
}

// ---------------------------------------------------------------------------
// Refinance chains (D-27, D-43, D-47)
// ---------------------------------------------------------------------------

export interface RefHandover {
  /** Grid month the successor draws in. */
  month: number;
  /** Predecessor balance the successor pays off. */
  paidOff: Dec;
  /** Successor balance drawn (its principal plus tranches up to the draw date). */
  drawn: Dec;
  /** The predecessor's tranches landing in that month (dated by the successor's start),
   *  paid off with the rest; the draw row's `draw` shows only the successor's. */
  ownerDraw: Dec;
}

/**
 * One property's loans as a refinance chain on the baseDate grid (J-03 a′). The chain
 * opens with the loan in force at baseDate (else the earliest) and each later start is
 * a successor. A successor draws on the first grid date on/after its start. The
 * predecessor's payment in that grid month is still paid when due on/before the
 * successor's start, and the draw row carries it; otherwise it is dropped and its
 * balance before that month, plus that month's tranches, is paid off (D-47). Tranches
 * dated after the successor's start are dropped (DR-126). Two successors drawing in the same
 * grid month are not modelled.
 */
export function referenceChain(
  loans: RefLoan[],
  opts: RefOptions,
): { rows: RefRow[]; handovers: RefHandover[] } {
  const base = opts.baseDate;
  const sorted = [...loans].sort((a, b) => (a.start < b.start ? -1 : 1));
  const inForce = sorted.filter((l) => l.start <= base).at(-1);
  // A loan's tranches dated after its successor's start are never drawn (DR-126);
  // nor are its prepayments or recasts (ADR 0109).
  const chain = (
    inForce ? sorted.filter((l) => l.start >= inForce.start) : sorted
  ).map((l, i, all) => {
    const next = all[i + 1];
    if (!next) return l;
    const upTo = <T extends { date: Iso }>(xs: T[]) =>
      xs.filter((x) => x.date <= next.start);
    return {
      ...l,
      ...(l.draws ? { draws: upTo(l.draws) } : {}),
      ...(l.prepayments ? { prepayments: upTo(l.prepayments) } : {}),
      ...(l.recasts ? { recasts: upTo(l.recasts) } : {}),
    };
  });
  const gridOpts = { ...opts, calendar: "gridDueDate" as const };
  const firstGridOnOrAfter = (date: Iso) => {
    let m = 0;
    while (addMonths(base, m) < date) m++;
    return m;
  };
  /** Due date of the payment a loan's row carries in grid month `m`. */
  const dueIn = (loan: RefLoan, m: number): Iso =>
    loan.start <= base
      ? addMonths(loan.start, paymentsMadeBy(loan.start, base) + m)
      : addMonths(loan.start, m - firstGridOnOrAfter(loan.start));

  let owner = chain[0];
  let rows = referenceSchedule(owner, gridOpts);
  let ownerDraw = owner.start <= base ? 0 : firstGridOnOrAfter(owner.start);
  const handovers: RefHandover[] = [];
  for (const succ of chain.slice(1)) {
    const D = firstGridOnOrAfter(succ.start);
    if (D > opts.months) break;
    if (D === ownerDraw) {
      throw new RangeError("Two successors in one grid month: not modelled.");
    }
    const own = rows[D - 1];
    const next = referenceSchedule(succ, gridOpts);
    const drawRow = next[D - 1];
    const kept = own.payment.greaterThan(ZERO) && dueIn(owner, D) <= succ.start;
    const before =
      D > 1
        ? rows[D - 2].endBalance
        : own.endBalance.plus(own.principal).plus(own.prepaid).minus(own.draw);
    // ADR 0109: the owner's prepayments (dated by the successor's start) in rows the
    // handover drops are paid then, in date order, before the successor pays off the
    // rest.
    const gridMonth = (loan: RefLoan, k: number) =>
      loan.start <= base
        ? k - paymentsMadeBy(loan.start, base)
        : k + firstGridOnOrAfter(loan.start);
    // A dropped payment's tranches in that month dated by the successor's start are
    // still drawn (only later ones are dropped, ADR 0079 §2), so they are paid off too.
    let owed = kept ? own.endBalance : before.plus(own.draw);
    let [late, lateFee] = [ZERO, ZERO];
    for (const p of [...(owner.prepayments ?? [])].sort((a, b) =>
      a.date < b.date ? -1 : 1,
    )) {
      const m = gridMonth(owner, firstPaymentOnOrAfter(owner.start, p.date));
      if (p.date <= base || m < D || (m === D && kept)) continue;
      const paid = Dec.min(d(p.amount), owed);
      owed = owed.minus(paid);
      late = late.plus(paid);
      if (paid.greaterThan(ZERO)) lateFee = lateFee.plus(p.fee ?? 0);
    }
    handovers.push({
      month: D,
      paidOff: owed,
      drawn: drawRow.endBalance,
      ownerDraw: own.draw,
    });
    const head: RefRow = kept
      ? { ...own, draw: drawRow.draw, endBalance: drawRow.endBalance }
      : drawRow;
    const merged: RefRow = {
      ...head,
      prepaid: head.prepaid.plus(late),
      fee: head.fee.plus(lateFee),
    };
    rows = [...rows.slice(0, D - 1), merged, ...next.slice(D)];
    owner = succ;
    ownerDraw = D;
  }
  return { rows, handovers };
}

export { Dec };
