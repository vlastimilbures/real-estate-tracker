// #441 item 2: a text that names a limit the code defines takes it as an argument,
// formatted by lib/format. At today's limits every language reads as before (the IRR's
// +1000 % gains the thousands space of fmtPct).
import { describe, it, expect } from "vitest";
import { isoDate } from "../../../engine";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { INT_RANGES } from "../../../lib/rules";
import { type DataCheckItem } from "../dataCheck";
import { dataCheckGroups } from "../dataCheckText";
import { inputRuleText } from "../inputRule";
import { irrReasonText } from "../irr";
import { assumptions } from "../../../engine/__tests__/support/seed";

const LANGS = { en, cs, ru };

describe("the recast maturity cap is an argument (#441 item 2)", () => {
  const before = {
    en: "The new maturity must be after the next payment and after a development loan's completion, and at most 50 years after the loan start (or the contract term, if longer)",
    cs: "Nová splatnost musí být po příští splátce a u úvěru na výstavbu po dokončení, a nejvýše 50 let od začátku úvěru (nebo smluvní doba, je-li delší)",
    ru: "Новая дата погашения должна быть после следующего платежа и, для кредита на строительство, после завершения, и не позднее 50 лет от начала кредита (или срока договора, если он дольше)",
  };

  it("reads as before at the longest loan term the forms accept", () => {
    expect(INT_RANGES.loanTermYears.max).toBe(50);
    for (const [lang, t] of Object.entries(LANGS))
      expect(inputRuleText(t, "INVALID_RECAST_MATURITY")).toBe(
        before[lang as keyof typeof before],
      );
  });

  it("names whatever cap it is given, in the count's plural form", () => {
    expect(en.inputRules.INVALID_RECAST_MATURITY("1", 1)).toContain(
      "at most 1 year after",
    );
    expect(cs.inputRules.INVALID_RECAST_MATURITY("3", 3)).toContain(
      "nejvýše 3 roky od",
    );
    expect(ru.inputRules.INVALID_RECAST_MATURITY("21", 21)).toContain(
      "не позднее 21 года от",
    );
  });

  it("passes every other rule's text through", () => {
    expect(inputRuleText(cs, "RATE_OUT_OF_RANGE")).toBe(
      cs.inputRules.RATE_OUT_OF_RANGE,
    );
  });
});

describe("the Data check thresholds are arguments (#441 item 2)", () => {
  const before = {
    en: [
      "The valuation in use is more than 12 months old. Value, equity and LTV start from it as entered: the time between its date and the projection start is not grown.",
      "The lease ends within 3 months and no next lease is entered. The projection assumes it is renewed.",
    ],
    cs: [
      "Použité ocenění je starší než 12 měsíců. Hodnota, vlastní kapitál a LTV vycházejí z ocenění tak, jak je zadané: doba mezi jeho datem a začátkem projekce se nezhodnocuje.",
      "Nájem končí do 3 měsíců a další nájem není zadán. Projekce počítá s prodloužením stávajícího nájmu.",
    ],
    ru: [
      "Используемой оценке больше 12 месяцев. Стоимость, собственный капитал и LTV исходят из неё в том виде, как она введена: рост за время между её датой и началом прогноза не учитывается.",
      "Аренда заканчивается в течение 3 месяцев, а следующая не внесена. Прогноз предполагает, что текущая аренда будет продлена.",
    ],
  };
  const items: DataCheckItem[] = [
    {
      propertyId: "p",
      name: "Byt P",
      finding: {
        kind: "valuationStale",
        validFrom: isoDate("2024-01-01"),
        months: 14,
      },
    },
    {
      propertyId: "p",
      name: "Byt P",
      finding: { kind: "leaseEnding", endDate: isoDate("2026-08-31") },
    },
  ];

  it("reads as before at today's 12 and 3 months", () => {
    for (const [lang, t] of Object.entries(LANGS))
      expect(
        dataCheckGroups(t, items, assumptions.postFixationResetRatePa).map(
          (g) => g.headline,
        ),
      ).toEqual(before[lang as keyof typeof before]);
  });

  it("names whatever threshold it is given, in the count's plural form", () => {
    expect(en.dataCheck.valuationStaleGroup("1", 1)).toContain(
      "more than 1 month old",
    );
    expect(cs.dataCheck.valuationStaleGroup("2", 2)).toContain(
      "starší než 2 měsíce",
    );
    expect(ru.dataCheck.leaseEndingGroup("1", 1)).toContain(
      "в течение 1 месяца",
    );
    expect(cs.dataCheck.leaseEndingGroup("1", 1)).toContain("do 1 měsíce");
  });
});

describe("the IRR search range is an argument (#441 item 2)", () => {
  it("names the engine's bracket, formatted by fmtPct", () => {
    expect(irrReasonText(en, "NO_ROOT")).toBe(
      "No IRR between −90 % and +1 000 %",
    );
    expect(irrReasonText(cs, "NO_ROOT")).toBe(
      "IRR neleží mezi −90 % a +1 000 %",
    );
    expect(irrReasonText(ru, "NO_ROOT")).toBe(
      "Нет IRR в диапазоне от −90 % до +1 000 %",
    );
  });
});
