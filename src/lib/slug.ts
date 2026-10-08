/** At most this many characters of the name, well inside a 255-byte file name. */
const MAX_STEM = 100;

/** A file-name stem from a UTF-8 name: lowercase, decomposable Latin diacritics folded
 *  (á → a), any other script kept (й stays й), every run of other characters one dash
 *  (ADR 0159). A mark not on a letter (an emoji's variation selector) is dropped. */
function fileStem(name: string): string {
  return [
    ...name
      .toLowerCase()
      .normalize("NFD")
      .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
      .replace(/(?<![\p{L}\p{M}])\p{M}+/gu, "")
      .normalize("NFC")
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, ""),
  ]
    .slice(0, MAX_STEM)
    .join("")
    .replace(/-$/, "");
}

/** An Excel export's file name, `{name}-{kind}[-{mode}].xlsx`. A name with no letter or
 *  digit uses `fallback` (the property id, or "portfolio") (ADR 0159). */
export function exportFilename(
  name: string,
  fallback: string,
  kind: string,
  mode?: string,
): string {
  const stem = fileStem(name) || fileStem(fallback) || "export";
  return `${[stem, kind, mode].filter(Boolean).join("-")}.xlsx`;
}
