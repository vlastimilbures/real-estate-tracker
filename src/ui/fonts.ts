/**
 * Load the bundled fonts before the first render, so charts measure their tick labels with
 * the final font (ADR 0192). Never rejects: a failed load is logged, the app falls back.
 */
// shortcut: the sample loads only the Latin and Latin Extended subsets, add text from another script if a chart ever draws it.
const CHART_TEXT = "0123456789 Kč";

export async function loadAppFonts(fonts: FontFaceSet): Promise<void> {
  const results = await Promise.allSettled(
    ["Public Sans Variable", "Fraunces Variable"].map((family) =>
      fonts.load(`1em "${family}"`, CHART_TEXT),
    ),
  );
  for (const r of results) if (r.status === "rejected") console.error(r.reason);
}
