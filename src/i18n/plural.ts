// Plural-form pickers. Czech and Russian both have three count categories; English
// has two. Each language's dictionary owns its own count strings and calls the matching
// picker, so the plural rule lives next to the words it governs.

/** English: 1 → one, everything else → other. */
export function enPlural(
  n: number,
  forms: [one: string, other: string],
): string {
  return n === 1 ? forms[0] : forms[1];
}

/**
 * Czech: 1 → one; 2–4 → few; 0 and 5+ → many (genitive plural).
 * e.g. 1 řádek · 2 řádky · 5 řádků.
 */
export function csPlural(
  n: number,
  forms: [one: string, few: string, many: string],
): string {
  const a = Math.abs(n);
  if (a === 1) return forms[0];
  if (a >= 2 && a <= 4) return forms[1];
  return forms[2];
}

/**
 * Russian: standard CLDR rule. 1, 21, 31… → one; 2–4, 22–24… → few; 0, 5–20, 11–14… → many.
 * e.g. 1 строка · 2 строки · 5 строк.
 */
export function ruPlural(
  n: number,
  forms: [one: string, few: string, many: string],
): string {
  const a = Math.abs(n) % 100;
  const d = a % 10;
  if (a >= 11 && a <= 14) return forms[2];
  if (d === 1) return forms[0];
  if (d >= 2 && d <= 4) return forms[1];
  return forms[2];
}
