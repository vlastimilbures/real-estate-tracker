/** A class list from its parts: each given class once, in order, one space apart; a
 *  `false`, `null`, `undefined` or empty part is left out. `cx("pill", on && "on")` is
 *  "pill on" or "pill". */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
