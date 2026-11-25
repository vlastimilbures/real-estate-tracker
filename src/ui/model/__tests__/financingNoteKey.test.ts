// The real-lens Financing note is one dictionary entry (wording log 2026-11-25), so cs
// and ru can phrase the whole note; before, the code joined two sentences with a space.
// The text shown stays the same in every language.
import { describe, expect, it } from "vitest";
import type { Portfolio } from "../../../engine";
import { BASE_DATE, assumptions } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { getEngineModel } from "../../../state/engineModel";
import type { Dictionary } from "../../../i18n";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { DEFAULT_RESET_WINDOW, financingView } from "../financing";

/** The real-lens note with rows, as shown before the change: the two sentences joined. */
const SHOWN = {
  en: "Debt at reset is nominal. Dates are modelled from the loans and leases you entered. They are not deadlines from your lender; check exact dates with your bank.",
  cs: "Dluh při změně je nominální. Data vycházejí z modelu podle zadaných úvěrů a nájmů. Nejsou to termíny banky; přesná data si ověřte u banky.",
  ru: "Долг на момент смены — номинальный. Даты рассчитаны по внесённым кредитам и договорам аренды. Это не сроки банка; точные даты уточните в банке.",
} as const;
const DICTS: Record<keyof typeof SHOWN, Dictionary> = { en, cs, ru };

function realNote(p: Portfolio, t: Dictionary) {
  const out = getEngineModel(p, assumptions).outputs([], BASE_DATE);
  const v = financingView(
    {
      fx: out.financing,
      portfolio: p,
      kpis: out.kpis,
      mode: "real",
      horizonYears: assumptions.horizonYears,
    },
    DEFAULT_RESET_WINDOW,
    t,
  );
  expect(v.timeline.rows.length).toBeGreaterThan(0);
  return v.note;
}

describe.each(Object.keys(SHOWN) as (keyof typeof SHOWN)[])(
  "the real-lens Financing note (%s)",
  (lang) => {
    const t = DICTS[lang];

    it("is the one entry dashboard.financingRowsNominalDisclaimer", () => {
      const entry: unknown = Reflect.get(
        t.dashboard,
        "financingRowsNominalDisclaimer",
      );
      expect(typeof entry).toBe("string");
      expect(realNote(mixed, t)).toBe(entry);
    });

    it("shows the same text as before, byte for byte", () => {
      expect(realNote(mixed, t)).toBe(SHOWN[lang]);
    });
  },
);
