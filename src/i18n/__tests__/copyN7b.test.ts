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
});
