// Wording guard (#152 item 6, ADR 0187): a Czech or Russian string that equals English
// is an untranslated miss, and a retired term must not come back once a concept has one
// name per language (docs/decisions/wording.md, 2026-10-13).
import { describe, it, expect } from "vitest";
import { en } from "../en";
import { cs } from "../cs";
import { ru } from "../ru";
import { leaves, type Tree } from "./support/leaves";

type Fn = (...args: unknown[]) => unknown;
const text = (v: unknown) =>
  typeof v === "function" ? String((v as Fn)(5, 5, 5, 5)) : String(v);
const E = leaves(en as unknown as Tree);
const DICTS = { cs, ru } as const;

/** The same in every language: acronyms, the brand, links, formats and symbols. */
const ACRONYM = /^[A-Z]{2,5}$/;
const SAME_AS_EN = new Set([
  "common.notApplicable", // "n/a"
  "app.loadingEyebrow", // brand
  "nav.importData", // "Import" is Czech too
  "importPage.title",
  "importPage.importTitle",
  "projections.portfolio", // "Portfolio" is Czech too
  "propertyDetail.sizeM2", // "5 m²"
  "propertyDetail.subMKcMode", // a number only
  "propertyDetail.auto",
  "propertyDetail.ioUntil", // "IO→date"
  "scenarios.crashAt", // " @ date"
  "scenarios.combinedTitle", // "level: parts"
  "scenarios.subPct", // "%"
  "forms.datePlaceholder", // "dd.mm.yyyy"
  "guide.glossary.svj.term", // the Czech term, glossed in every language
  "guide.glossary.propertyTax.term", // the Czech statutory name
  // About: brand, author, links and the tech list.
  "about.subtitle",
  "about.developerName",
  "about.feedbackText",
  "about.sourceText",
  "about.limitsText",
  "about.dataSafetyText",
  "about.builtWithBody",
  "about.copyright",
]);
const sameAllowed = (key: string, value: string) =>
  ACRONYM.test(value) || SAME_AS_EN.has(key);

/** Retired terms and the word that replaced them. */
const RETIRED: Record<keyof typeof DICTS, [RegExp, string][]> = {
  cs: [
    [/reset/i, "konec fixace / změna sazby"],
    [/refix/i, "konec fixace / nová fixace"],
    [/umořovac/i, "splátkový kalendář"],
    [/držení/, "náklady na držbu"],
    [/\bstart/i, "začátek"],
    [/Development/, "výstavba"],
    [/Daň z nemovitosti/, "daň z nemovitých věcí"],
  ],
  ru: [
    [/(^|[^а-яё])тел[оау]([^а-яё]|$)/i, "основной долг"],
    [/сброс/i, "конец фиксации / смена ставки"],
    [/рефикс|перефикс/i, "конец фиксации / новая фиксация"],
    [/переамортиз/i, "пересчёт платежа"],
    [/переякор/i, "рост отсчитывается заново"],
    [/выдан/i, "выбрано"],
    [/амортизац/i, "график платежей"],
    [/Номинал([^ь]|$)/, "номинальные"],
    [/(?<!%\s?)годовых/, "в год / годовая ставка"],
  ],
};

describe("wording guard (#152 item 6)", () => {
  for (const lang of ["cs", "ru"] as const) {
    const all = [...leaves(DICTS[lang] as unknown as Tree)].map(
      ([k, v]) => [k, text(v)] as const,
    );

    it(`${lang}: no string is left in English`, () => {
      const same = all.filter(
        ([k, v]) => v === text(E.get(k)) && !sameAllowed(k, v),
      );
      expect(same).toEqual([]);
    });

    it(`${lang}: no retired term comes back`, () => {
      const hits = all.flatMap(([k, v]) =>
        RETIRED[lang]
          .filter(([re]) => re.test(v))
          .map(([re, use]) => `${k}: ${re} → use "${use}"`),
      );
      expect(hits).toEqual([]);
    });
  }
});
