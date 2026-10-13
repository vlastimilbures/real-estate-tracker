/**
 * Load the bundled fonts before the first render, so charts measure their tick labels with
 * the final font (ADR 0192). Never rejects and gives up after a second: a failed, missing or
 * slow font is logged and the app renders with the fallback.
 */
// shortcut: "Kč" pulls in Latin Extended next to Latin, which holds every tick character;
// the families have no Cyrillic, so ru text always uses the system font. Extend the sample if
// a chart ever draws Vietnamese.
const CHART_TEXT = "0123456789 Kč";
const TIMEOUT_MS = 1000;

export async function loadAppFonts(fonts: FontFaceSet): Promise<void> {
  const loads = Promise.allSettled(
    ["Public Sans Variable", "Fraunces Variable"].map(async (family) => {
      const faces = await fonts.load(`1em "${family}"`, CHART_TEXT);
      if (faces.length === 0) throw new Error(`Font not registered: ${family}`);
    }),
  );
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), TIMEOUT_MS),
  );
  const results = await Promise.race([loads, timeout]);
  if (results === "timeout")
    return console.error(`Fonts not loaded after ${TIMEOUT_MS} ms`);
  for (const r of results) if (r.status === "rejected") console.error(r.reason);
}
