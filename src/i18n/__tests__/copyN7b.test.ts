// Track 14 N7b copy (ADR 0187, docs/decisions/wording.md 2026-10-13): the owner-approved
// text of each changed key, per language.
import { describe, it, expect } from "vitest";
import { en } from "../en";
import { cs } from "../cs";
import { ru } from "../ru";

describe("N7b wording (#169, #152)", () => {
  it.each([
    ["cs", cs, 1, "1 scénář"],
    ["cs", cs, 3, "3 scénáře"],
    ["cs", cs, 5, "5 scénářů"],
    ["ru", ru, 1, "1 сценарий"],
    ["ru", ru, 3, "3 сценария"],
    ["ru", ru, 5, "5 сценариев"],
  ])("%s: the compare-full toasts decline %i", (_, d, max, words) => {
    expect(d.scenarios.addedCompareFull("A", max)).toContain(words);
    expect(d.scenarios.duplicatedCompareFull("A", max)).toContain(words);
  });

  it.each([
    [1, "až 1 scénář"],
    [3, "až 3 scénáře"],
    [5, "až 5 scénářů"],
  ])("cs: the list hint declines %i", (max, words) => {
    expect(cs.scenarios.listHint(max)).toContain(words);
  });

  it("en and ru: the count word follows the number", () => {
    expect(en.scenarios.addedCompareFull("A", 1)).toContain("1 scenario,");
    expect(en.scenarios.listHint(3)).toContain("up to 3 scenarios");
    expect(ru.scenarios.listHint(1)).toContain("до 1 сценария");
    expect(ru.scenarios.listHint(3)).toContain("до 3 сценариев");
  });
  it("ru: principal is основной долг (#169 G1-2-05)", () => {
    expect(ru.dashboard.kpiSumPrincipalRepaid(30)).toBe(
      "Σ погашенного основного долга (годы 1–30)",
    );
    expect(ru.dashboard.kpiSumPrincipalRepaidNominal(30)).toBe(
      "Σ погашенного основного долга (годы 1–30, номинально)",
    );
    expect(ru.propertyDetail.colInitialPrincipal).toBe("Начальный долг");
    expect(ru.propertyDetail.fieldInitialPrincipal).toBe("Начальный долг");
    expect(ru.propertyDetail.calcDisabled).toBe(
      "Сначала введите начальный долг и процентную ставку",
    );
    expect(ru.propertyDetail.amColPrincipal).toBe("Осн. долг");
    expect(ru.projGrid.principal).toBe("Осн. долг");
    expect(ru.guide.fPrincipal).toBe("основной долг = платёж − проценты");
    expect(ru.guide.fNewBalance).toBe(
      "новый остаток = остаток − основной долг",
    );
    expect(ru.guide.mortgagesProse1Post).toContain(
      "больше идёт на погашение основного долга",
    );
    expect(ru.guide.projectionProse2).toContain(
      "сумма погашенного основного долга",
    );
    expect(ru.guide.developmentProsePost).toContain(
      "(без погашения основного долга)",
    );
  });

  it("ru: drawing is выборка, never выдача (#169 G1-2-05)", () => {
    expect(ru.propertyDetail.amColDrawn).toBe("Выбрано");
    expect(ru.propertyDetail.helpDraws).toMatch(
      /^Как выбирается кредит\. Первая строка — сумма, выбранная в день старта;/,
    );
    expect(ru.propertyDetail.warnAfterCompletion).toBe(
      "Выбран после окончания периода только процентов; кредит снова пересчитывается при этой выборке",
    );
    expect(ru.inputRules.DRAW_BEFORE_START).toContain("сумма, выбранная");
    expect(ru.propertyDetail.instalmentHintDev("X")).toContain(
      "для суммы, выбранной при старте",
    );
    expect(ru.guide.developmentProsePost).toContain("сумму, выбранную");
    expect(ru.dashboard.financingNoLoans).toBe(
      "Среди выбранных объектов нет ипотеки.",
    );
  });

  it("ru: the pre-restore copy is a страховочная копия (#169 G1-2-05)", () => {
    expect(ru.backup.folderHint).toMatch(/^Страховочные копии, сохранённые/);
    expect(ru.backup.restoreBody).toMatch(
      /сохранится страховочная копия текущих данных\.$/,
    );
    expect(ru.backup.restoreWarning).toMatch(
      /Сначала будет сохранена страховочная копия текущих данных\.$/,
    );
  });

  it("ru: nominal pairs with real as an adjective (#169 G1-2-05)", () => {
    expect(ru.common.nominal).toBe("Номинальные");
    expect(ru.scenarios.kpiNetWorthNominal).toBe("Чистые активы (номинальные)");
    expect(ru.scenarios.kpiCagrNominal).toBe("CAGR (номинальный)");
    expect(ru.scenarios.kpiLeveredIrrNominal).toBe(
      "IRR с плечом (номинальный)",
    );
    expect(ru.propertyDetail.acqHint).toBe("как указано, номинально");
  });
  it('ru: yearly rates read without a bare "годовых" (#169 G1-2-07)', () => {
    expect(ru.propertyDetail.fieldInterestRate).toBe(
      "Годовая процентная ставка",
    );
    expect(ru.assumptions.appreciation).toBe("Рост стоимости в год");
    expect(ru.assumptions.rentIndexation).toBe("Индексация аренды в год");
    expect(ru.assumptions.inflation).toBe("Инфляция (CPI) в год");
    expect(ru.scenarios.fieldAppreciation).toBe("Рост стоимости в год");
    expect(ru.scenarios.fieldRentIndexation).toBe("Индексация аренды в год");
    expect(ru.scenarios.fieldInflation).toBe("Инфляция в год");
  });

  it("ru/cs: Guide grammar and meaning (#169 G1-2-07)", () => {
    expect(ru.guide.projectionProse2).toMatch(
      /Результаты включают первый год с положительным потоком и год без долга\.$/,
    );
    expect(ru.guide.mortgagesProse1Mid).toBe(
      " — постоянный месячный платёж, из которого сначала покрываются проценты: ",
    );
    expect(cs.guide.mortgagesProse1Mid).toBe(
      " — konstantní měsíční splátka, ze které se nejdřív hradí úrok: ",
    );
    expect(ru.guide.snapshotDefs.value.meaning).toContain(
      "(или с даты более поздней оценки, от которой рост отсчитывается заново)",
    );
  });

  it("ru/cs: the Projections picker names portfolio or property (#169 G1-2-07)", () => {
    expect(ru.projections.entity).toBe("Портфель или объект");
    expect(cs.projections.entity).toBe("Portfolio nebo nemovitost");
  });
  it('cs: no English or "start" left (#169 G1-2-08)', () => {
    expect(cs.propertyDetail.colDevelopment).toBe("Výstavba");
    expect(cs.scenarios.atStart).toBe("Začátek");
    expect(cs.propertyDetail.drawnAtStart).toBe("Čerpáno na začátku");
    expect(cs.propertyDetail.drawnAtStartNoDate).toBe("v den začátku");
    expect(cs.propertyDetail.drawdownTotal("X", 2)).toMatch(/ po začátku$/);
    expect(cs.inputRules.DRAW_BEFORE_START).toContain(
      "patří do pole Čerpáno na začátku",
    );
    expect(cs.propertyDetail.instalmentHintDev("X")).toContain(
      "pro částku čerpanou na začátku;",
    );
    expect(cs.propertyDetail.helpDraws).toContain("v den začátku");
    expect(cs.guide.developmentProsePost).toContain("v den začátku");
  });

  it("cs: hints, holding costs and the tax name (#169 G1-2-08)", () => {
    expect(cs.dashboard.monthlyHint("01.10.2026")).toBe(
      "roční výše při současných nájmech ÷ 12, nájemní smlouvy platné k 01.10.2026",
    );
    expect(cs.guide.snapshotDefs.noi.meaning).toMatch(
      /hotovost, kterou vynáší samo aktivum\.$/,
    );
    expect(cs.backup.tables.holding_costs).toBe("Náklady na držbu");
    expect(cs.inputRules.DUPLICATE_HOLDING_COST).toMatch(
      /záznam nákladů na držbu$/,
    );
    expect(cs.about.appBody).toContain("nájem, náklady na držbu a cash flow");
    expect(cs.propertyDetail.fieldPropertyTax).toBe(
      "Daň z nemovitých věcí /rok",
    );
    expect(cs.assumptions.propertyTax).toBe("Daň z nemovitých věcí /rok");
  });
  it('en: "refix" becomes fixation end (#152 item 3)', () => {
    expect(en.scenarios.rateShockAtRefix).toBe("Rate shock at fixation end");
    expect(en.scenarios.fieldRateShock).toBe("Rate shock at fixation end");
    expect(en.scenarios.reachHits(1, 2, "2030")).toMatch(
      /\(fixation end 2030\)$/,
    );
    expect(en.scenarios.reachNone).toBe(
      "no loan's fixation ends inside the shock window, so no effect",
    );
    expect(en.propertyDetail.successorNote).toContain(
      "(new fixation or refinance)",
    );
    expect(en.propertyDetail.fixationEnded("x", "y")).toMatch(
      /Add the terms of the new fixation as a new mortgage block\.$/,
    );
    expect(en.guide.scenarioDefs.rateShock.formula).toBe(
      "+Δ around fixation end",
    );
    expect(en.guide.scenarioDefs.rateShock.meaning).toBe(
      "A higher rate around a fixation end for a set period.",
    );
  });

  it("cs: one name for the fixation end and the field it points to (#152 items 3, 4)", () => {
    expect(cs.propertyDetail.mortgagesHint).toBe(
      "na konci fixace se změní sazba a splátka se přepočítá",
    );
    expect(cs.propertyDetail.successorNote).toContain(
      "(nová fixace nebo refinancování)",
    );
    expect(cs.propertyDetail.fixationEnded("x", "4,5 %")).toBe(
      "Fixace skončila x a není zadán navazující blok, proto aplikace od té doby počítá se sazbou po skončení fixace 4,5 %. Zadejte podmínky nové fixace jako nový blok hypotéky.",
    );
    expect(cs.propertyDetail.fixationEndedUntil("x", "y", "4,5 %")).toContain(
      "počítá se sazbou po skončení fixace 4,5 % od",
    );
    expect(cs.scenarios.rateShockAtRefix).toBe("Šok sazby na konci fixace");
    expect(cs.scenarios.fieldRateShock).toBe("Šok sazby na konci fixace");
    expect(cs.scenarios.reachHits(1, 2, "2030")).toMatch(
      /\(konec fixace 2030\)$/,
    );
    expect(cs.scenarios.reachNone).toBe(
      "v okně šoku žádnému úvěru nekončí fixace, takže bez vlivu",
    );
    expect(cs.guide.mortgagesProse2Resets).toBe("změní");
    expect(cs.guide.mortgagesProse2Reamortizes).toBe("přepočítá");
    expect(cs.guide.snapshotDefs.debt.meaning).toContain(
      "případnou změnu sazby po fixaci",
    );
    expect(cs.guide.projectionDefs.debt.meaning).toBe(
      "Sleduje plán včetně změn sazby na konci fixace.",
    );
    expect(cs.guide.scenarioDefs.rateShock.formula).toBe(
      "+Δ kolem konce fixace",
    );
    expect(cs.guide.scenarioDefs.rateShock.meaning).toBe(
      "Vyšší sazba kolem konce fixace po stanovenou dobu.",
    );
    expect(cs.guide.glossary.reset.term).toBe(
      "Konec fixace / přepočet splátky",
    );
    expect(cs.inputRules.ASOF_BEFORE_BASEDATE).toBe(
      "Datum je před základním datem",
    );
    expect(cs.scenarios.keyFiguresHintReal).toBe(
      "reálně (ceny k základnímu datu)",
    );
  });

  it("ru: one name for the fixation end and the field it points to (#152 items 3, 4)", () => {
    expect(ru.propertyDetail.mortgagesHint).toBe(
      "в конце фиксации меняется ставка и пересчитывается платёж",
    );
    expect(ru.propertyDetail.helpCompletionDate).toBe(
      "до этой даты платить только проценты, затем гасить и основной долг",
    );
    expect(ru.propertyDetail.successorNote).toContain(
      "(новая фиксация или рефинансирование)",
    );
    expect(ru.propertyDetail.fixationEnded("x", "4,5 %")).toMatch(
      /ставку после фиксации 4,5 %\. Добавьте условия новой фиксации как новый блок ипотеки\.$/,
    );
    expect(ru.propertyDetail.fixationEndedUntil("x", "y", "4,5 %")).toContain(
      "ставку после фиксации 4,5 % с",
    );
    expect(ru.scenarios.rateShockAtRefix).toBe("Шок ставки в конце фиксации");
    expect(ru.scenarios.fieldRateShock).toBe("Шок ставки в конце фиксации");
    expect(ru.guide.mortgagesProse2Resets).toBe("меняется");
    expect(ru.guide.mortgagesProse2Reamortizes).toBe("пересчитывается");
    expect(ru.guide.developmentProsePost).toContain(
      "платёж пересчитывается по обычному графику платежей.",
    );
    expect(ru.guide.snapshotDefs.debt.meaning).toContain(
      "любую смену ставки в конце фиксации",
    );
    expect(ru.guide.projectionDefs.debt.meaning).toBe(
      "Следует графику, включая смену ставки в конце фиксации.",
    );
    expect(ru.guide.scenarioDefs.rateShock.formula).toBe(
      "+Δ вокруг конца фиксации",
    );
    expect(ru.guide.scenarioDefs.rateShock.meaning).toBe(
      "Повышенная ставка вокруг конца фиксации на заданный период.",
    );
    expect(ru.guide.glossary.reset.term).toBe(
      "Конец фиксации / пересчёт платежа",
    );
    expect(ru.scenarios.keyFiguresHintReal).toBe(
      "в реальном выражении (Kč на базовую дату)",
    );
  });
  it.each([
    [
      "cs",
      cs,
      "Splátkový kalendář",
      "Zobrazit splátkový kalendář (2 splátky)",
      "Skrýt splátkový kalendář",
    ],
    [
      "ru",
      ru,
      "График платежей",
      "Показать график платежей (2 платежа)",
      "Скрыть график платежей",
    ],
  ])(
    "%s: the schedule has the banks' name (#152 item 5)",
    (_, d, name, show, hide) => {
      expect(d.propertyDetail.sectionAmortization).toBe(name);
      expect(d.propertyDetail.amortizationTitle).toBe(name);
      expect(d.propertyDetail.showAmortization(2)).toBe(show);
      expect(d.propertyDetail.hideAmortization).toBe(hide);
      expect(d.guide.projectionDefs.debt.formula).toBe(name.toLowerCase());
    },
  );

  it("cs/ru: prose uses the same schedule name (#152 item 5)", () => {
    expect(cs.importPage.noEffectNote).toContain("splátkový kalendář");
    expect(cs.guide.snapshotDefs.debt.meaning).toMatch(
      /^Zbývající zůstatek úvěru ze splátkového kalendáře/,
    );
    expect(cs.guide.developmentProsePost).toContain(
      "podle běžného splátkového kalendáře",
    );
    expect(ru.importPage.noEffectNote).toContain("график платежей");
    expect(ru.guide.snapshotDefs.debt.meaning).toMatch(
      /^Оставшийся остаток кредита из графика платежей/,
    );
  });

  it.each([
    [
      "en",
      en,
      "The base-date snapshot's value, debt and equity equal year 0 of the projection; rent, costs and cash flows start in year 1.",
    ],
    [
      "cs",
      cs,
      "Hodnota, dluh a kapitál snímku k základnímu datu se rovnají roku 0 projekce; nájem, náklady a peněžní toky začínají v roce 1.",
    ],
    [
      "ru",
      ru,
      "Стоимость, долг и капитал снимка на базовую дату равны году 0 прогноза; аренда, расходы и денежные потоки начинаются с года 1.",
    ],
  ])(
    "%s: the Guide says which figures year 0 shares (#152 item 2)",
    (_, d, last) => {
      expect(d.guide.cardAsOfBody.endsWith(last)).toBe(true);
    },
  );

  it.each([
    [
      "en",
      en,
      "fixed part grows with CPI",
      "Fixed costs (property tax, insurance, SVJ, other) grow with CPI from the inflation rate; management and maintenance stay a share of rent, so they follow rent.",
    ],
    [
      "cs",
      cs,
      "fixní část roste s CPI",
      "Fixní náklady (daň z nemovitých věcí, pojištění, SVJ, ostatní) rostou s CPI podle míry inflace; správa a údržba zůstávají podílem z nájmu, takže sledují nájem.",
    ],
    [
      "ru",
      ru,
      "постоянная часть растёт с CPI",
      "Постоянные расходы (налог на недвижимость, страхование, SVJ, прочие) растут с CPI по ставке инфляции; управление и обслуживание остаются долей аренды и следуют за ней.",
    ],
  ])(
    "%s: the Guide says only fixed costs follow CPI (#152 item 2)",
    (_, d, formula, meaning) => {
      expect(d.guide.projectionDefs.costs.formula).toBe(formula);
      expect(d.guide.projectionDefs.costs.meaning).toBe(meaning);
    },
  );
  it.each([
    [
      "en",
      en,
      [
        "This line has 1 column; the header has 8",
        "This line has 3 columns; the header has 8",
        "This line has 5 columns; the header has 8",
      ],
    ],
    [
      "cs",
      cs,
      [
        "Tento řádek má 1 sloupec; záhlaví jich má 8",
        "Tento řádek má 3 sloupce; záhlaví jich má 8",
        "Tento řádek má 5 sloupců; záhlaví jich má 8",
      ],
    ],
    [
      "ru",
      ru,
      [
        "В этой строке 1 столбец, в заголовке 8",
        "В этой строке 3 столбца, в заголовке 8",
        "В этой строке 5 столбцов, в заголовке 8",
      ],
    ],
  ])(
    "%s: the CSV row-length error declines its count (#169 G1-2-03)",
    (_, d, texts) => {
      expect([1, 3, 5].map((n) => d.importPage.errMalformedRow(8, n))).toEqual(
        texts,
      );
    },
  );

  it("ru: the filter subtitle declines by the total (#169 G1-2-03)", () => {
    expect(ru.dashboard.subFilter(1, 21)).toBe("1 из 21 объекта");
    expect(ru.dashboard.subFilter(2, 5)).toBe("2 из 5 объектов");
  });
  it.each([
    ["en", en, "Stress (copy)"],
    ["cs", cs, "Stress (kopie)"],
    ["ru", ru, "Stress (копия)"],
  ])(
    "%s: a duplicate's name takes the suffix in the UI language (#169 R4-03)",
    (_, d, name) => {
      expect(d.scenarios.copyName("Stress")).toBe(name);
    },
  );
  it("cs: review follow-ups name fields and terms as shown (#152 items 3, 4)", () => {
    expect(cs.guide.glossary.propertyTax.def).toBe(
      "Roční daň z nemovitých věcí.",
    );
    expect(cs.dataCheck.earlyDateRecord.assumptions).toBe("Základní datum");
    expect(cs.propertyDetail.helpCompletionDate).toBe(
      "do tohoto data platit jen úroky, poté splácet i jistinu",
    );
    expect(cs.guide.developmentProsePost).toContain(
      "Když přijde tranše nebo se výstavba dokončí, splátka se přepočítá podle běžného splátkového kalendáře.",
    );
    expect(cs.scenarios.sumResetRate("5,0 %")).toBe(
      "sazba po skončení fixace 5,0 %",
    );
  });
});
