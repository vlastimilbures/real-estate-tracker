// Track 14 N7a copy (docs/decisions/wording.md, 2026-10-13): the owner-approved text of
// each changed key, per language.
import { describe, it, expect } from "vitest";
import { en } from "../en";
import { cs } from "../cs";
import { ru } from "../ru";

describe("N7a wording (#251, #242, #156, #173, #330)", () => {
  it.each([
    [
      "en",
      en,
      "Interest saved by prepayments over the loan's remaining life (nominal)",
    ],
    [
      "cs",
      cs,
      "Úrok ušetřený mimořádnými splátkami za zbývající dobu splácení úvěru (nominálně)",
    ],
    [
      "ru",
      ru,
      "Сэкономлено процентов досрочными платежами за оставшийся срок кредита (номинально)",
    ],
  ])("%s: the property interest-saved label names its window", (_, d, text) => {
    expect(d.propertyDetail.interestSaved).toBe(text);
  });

  it.each([
    ["en", en, /500 000 \(a space between thousands\)$/],
    ["cs", cs, /500 000 \(tisíce oddělte mezerou\)$/],
    ["ru", ru, /500 000 \(тысячи разделяйте пробелом\)$/],
  ])("%s: a row amount error says how to group thousands", (_, d, re) => {
    expect(d.forms.positiveAmount).toMatch(re);
  });

  it.each([
    [
      "en",
      en,
      "Rate, loan and lease dates in the next 12 months",
      "No rate, loan or lease dates in the next 12 months.",
    ],
    [
      "cs",
      cs,
      "Termíny sazeb, úvěrů a nájmů v příštích 12 měsících",
      "V příštích 12 měsících nejsou žádné termíny sazeb, úvěrů ani nájmů.",
    ],
    [
      "ru",
      ru,
      "Даты по ставкам, кредитам и аренде в ближайшие 12 месяцев",
      "В ближайшие 12 месяцев нет дат по ставкам, кредитам и аренде.",
    ],
  ])(
    "%s: the upcoming list names what it holds (ADR 0103 §7)",
    (_, d, heading, empty) => {
      expect(d.dashboard.financingUpcoming).toBe(heading);
      expect(d.dashboard.financingNoEvents).toBe(empty);
    },
  );

  it.each([
    [
      "en",
      en,
      "A prepayment is applied right after the next payment due on or after its date",
      "falls after payoff or cannot shorten the term.",
    ],
    [
      "cs",
      cs,
      "Mimořádná splátka se uplatní hned po nejbližší splátce splatné k jejímu datu nebo později",
      "připadá po doplacení nebo nemůže zkrátit splatnost.",
    ],
    [
      "ru",
      ru,
      "Досрочный платёж применяется сразу после ближайшего платежа, срок которого наступает в его дату или позже",
      "приходится на время после погашения или не может сократить срок.",
    ],
  ])(
    "%s: the Guide says when a prepayment applies and what is warned",
    (_, d, timing, warns) => {
      expect(d.guide.mortgagesProse3).toContain(timing);
      expect(d.guide.mortgagesProse3).toContain(warns);
    },
  );

  it("en says own funds and maturity change, never cash or recast", () => {
    const texts = [
      en.propertyDetail.helpPrepayments,
      en.guide.mortgagesProse3,
      en.propertyDetail.loanSummaryHint,
      en.propertyDetail.interestSavedNa,
      en.dashboard.financingInterestSavedNa,
    ];
    for (const s of texts)
      expect(s).not.toMatch(/paid in cash|own cash|recast/);
    expect(en.propertyDetail.helpPrepayments).toMatch(
      /The fee is paid from your own funds and does not reduce the debt\.$/,
    );
    expect(en.guide.mortgagesProse3).toContain(
      "Prepayments are paid from your own funds, kept outside net cash flow and DSCR",
    );
    expect(en.propertyDetail.loanSummaryHint).toBe(
      "modelled from your loans, prepayments and maturity changes",
    );
    expect(en.propertyDetail.interestSavedNa).toBe(
      "n/a: a maturity change depends on the prepayment",
    );
    expect(en.dashboard.financingInterestSavedNa).toBe(
      en.propertyDetail.interestSavedNa,
    );
  });
});

// ADR 0186 (#155): net worth on the compare page leaves out cash.
describe("compare says net worth excludes cash (ADR 0186)", () => {
  it.each([
    [
      "en",
      en,
      "Δ net worth vs Base (without cash)",
      "for the loss to you, compare both Δ net worth vs Base and cumulative cash to owner.",
      "Cash taken out or paid in over the years is not included.",
    ],
    [
      "cs",
      cs,
      "Δ čistého jmění vůči Základu (bez hotovosti)",
      "ztrátu pro vás ukazuje Δ čistého jmění vůči Základu spolu s kumulativní hotovostí vlastníkovi.",
      "Hotovost vybraná nebo vložená během let se nezapočítává.",
    ],
    [
      "ru",
      ru,
      "Δ чистых активов к Базе (без денежных средств)",
      "ваш убыток показывают Δ чистых активов к Базе и накопленный ДП владельцу.",
      "Деньги, полученные или внесённые за эти годы, не учитываются.",
    ],
  ])("%s", (_, d, row, footnote, guide) => {
    expect(d.scenarios.kpiNetWorthDeltaVsBase).toBe(row);
    const note = d.scenarios.rebasedReturnsFootnote("Crash");
    expect(note).toContain(" Crash ");
    expect(note).toContain(`; ${footnote}`);
    expect(d.guide.returnsDefs.multiple.meaning).toContain(` ${guide}`);
  });
});
