// Figures as the tables and tiles print them: money, M Kč and DSCR. Formatting only, no
// maths, and no hooks: a pure function of the value (CLAUDE.md §5).
import type { Decimal } from "../../lib/money";
import {
  fmtCzk,
  fmtCzkM,
  fmtDscr,
  roundCzk,
  signTone,
  type Tone,
} from "../../lib/format";

type Num = Decimal | number;

/** Money value with accounting conventions: red parentheses for negatives. Only a
 *  `signed` flow (net cash flow, NOI) is also green when positive. The tone follows the
 *  value as printed, so "0 Kč" is never coloured (ADR 0178). */
export function Money({
  value,
  parens = true,
  suffix = true,
  signed = false,
}: {
  value: Num;
  parens?: boolean | undefined;
  suffix?: boolean | undefined;
  signed?: boolean | undefined;
}) {
  const sign: Tone = signTone(roundCzk(value));
  const t: Tone = signed || sign === "negative" ? sign : "neutral";
  return (
    <span className={`num tone-${t}`}>{fmtCzk(value, { parens, suffix })}</span>
  );
}

/** An amount in M Kč (a tile's headline), red when negative (CLAUDE.md §5). The exact
 *  amount is its tooltip and is read out after it, as IrrValue's reason (ADR 0200). */
export function MoneyM({ value }: { value: Num }) {
  const exact = fmtCzk(value);
  const tone =
    signTone(roundCzk(value)) === "negative" ? "negative" : "neutral";
  return (
    <span className={`num tone-${tone}`} title={exact}>
      {fmtCzkM(value)}
      <span className="sr-only"> ({exact})</span>
    </span>
  );
}

/** DSCR, capped for display at ">99,00x" (ADR 0035). */
export function Dscr({ value }: { value: Num }) {
  return <span className="num">{fmtDscr(value)}</span>;
}
