// Where a form shows its errors, read from the DOM (#490 PR 3 pins): each error text
// keyed by the field it sits in (its label, inside its row group and list, if any), and
// every form-level line (alert, error summary, banner) under "form".
const FORM_LEVEL = '[role="alert"], .error-summary, .error-banner';

function placeOf(err: Element): string {
  const field = err.closest(".field")?.querySelector("label")?.textContent;
  const row = err.closest('[role="group"]')?.getAttribute("aria-label");
  const list = err.closest("fieldset")?.querySelector("legend")?.textContent;
  return [list, row, field].filter(Boolean).join(" › ") || "?";
}

export function shownErrors(
  root: ParentNode = document.body,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const err of root.querySelectorAll(".err")) {
    if (err.closest(FORM_LEVEL)) continue;
    const place = placeOf(err);
    out[place] = out[place]
      ? `${out[place]} | ${err.textContent}`
      : (err.textContent ?? "");
  }
  const form = [...root.querySelectorAll(FORM_LEVEL)]
    .filter((el) => !el.parentElement?.closest(FORM_LEVEL))
    .map((el) => el.textContent ?? "")
    .filter((text) => text !== "");
  if (form.length > 0) out.form = form.join(" | ");
  return out;
}
