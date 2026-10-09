// @vitest-environment jsdom
//
// ADR 0091 (#16): the Guide and About describe the figures the way the model computes them —
// the multiple and IRR start from projection-start equity, the principal check is qualified,
// net cash flow is a modelled estimate, rent follows leases, and About states the ±1 Kč
// tolerance in every language.
import { describe, it, expect, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { Guide } from "../Guide";
import { useUiStore } from "../../../state/uiStore";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";

const DICTS = { en, cs, ru };

beforeEach(() =>
  act(() =>
    useUiStore.setState({ language: "en", route: "guide", guideTerm: null }),
  ),
);

function guideText(): string {
  const { container } = render(<Guide />);
  return container.textContent ?? "";
}

describe("Guide wording (ADR 0091)", () => {
  it("drops the claims that overstate the model", () => {
    const text = guideText();
    for (const phrase of [
      "equity today",
      "money you put in",
      "sale at the end",
      "actually lands in your pocket",
      "exactly equal the starting debt",
    ]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("explains cash invested and sources and uses in every language (ADR 0119 §9)", () => {
    const text = guideText();
    expect(text).toContain(en.guide.returnsDefs.cashInvested.name);
    expect(text).toContain(en.guide.returnsDefs.sourcesUses.formula);
    for (const d of Object.values(DICTS)) {
      expect(d.guide.returnsDefs.cashInvested.caveat).toBeTruthy();
      expect(d.guide.returnsDefs.sourcesUses.meaning).toMatch(/1 Kč/);
    }
  });

  it("measures the multiple and IRR from projection-start equity", () => {
    const rd = en.guide.returnsDefs;
    expect(rd.multiple.formula).toBe(
      "equity at horizon ÷ equity at projection start",
    );
    expect(rd.irr.meaning).toMatch(/projection start/);
    expect(rd.irr.meaning).toMatch(/no selling costs or tax/);
  });

  it("qualifies the principal check with full repayment and later draws", () => {
    expect(en.guide.projectionProse2).toMatch(
      /when every loan is repaid within the horizon/,
    );
    expect(en.guide.projectionProse2).toMatch(/later draws/);
  });

  it("describes lease-driven rent: leases, gaps and renewal", () => {
    const rent = en.guide.projectionDefs.rent;
    const text = `${rent.formula} ${rent.meaning}`;
    expect(text).toMatch(/lease/);
    expect(text).toMatch(/gap/);
    expect(text).toMatch(/renewed/);
  });

  it("shows what IRR and net cash flow do not mean", () => {
    guideText();
    const caveats = [...document.querySelectorAll(".guide-caveat")].map(
      (el) => el.textContent,
    );
    expect(caveats).toEqual(
      expect.arrayContaining([
        "Not actual receipts.",
        "Not the return on your original purchase cash.",
      ]),
    );
    for (const d of Object.values(DICTS)) {
      expect(d.guide.snapshotDefs.netCashFlow.caveat).toBeTruthy();
      expect(d.guide.returnsDefs.irr.caveat).toBeTruthy();
    }
  });

  it("says deactivating does not record a sale", () => {
    const note = "does not record a sale, sale proceeds or a loan payoff";
    expect(guideText()).toContain(note);
    expect(en.propertyDetail.confirmDeactivate("Flat A")).toContain(note);
  });
});

describe("About precision note (ADR 0091)", () => {
  it("states the ±1 Kč tolerance in every language", () => {
    for (const d of Object.values(DICTS)) {
      expect(d.about.precisionNote).toContain("±1 Kč");
    }
    expect(en.about.precisionNote).not.toMatch(/to the cent/);
    expect(cs.about.precisionNote).not.toMatch(/na korunu/);
    expect(ru.about.precisionNote).not.toMatch(/до кроны/);
  });
});

// ADR 0092 (#28): the Guide ends by pointing to the limitations and data-safety documents,
// with the same plain-text addresses as About, in every language.
const LIMITS_DOC =
  "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/model-limitations.md";
const DATA_SAFETY_DOC =
  "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/data-safety.md";

describe("Guide limits and data-safety pointer (ADR 0092)", () => {
  it("shows the planning-estimate note and both document addresses", () => {
    const { container } = render(<Guide />);
    const text = container.textContent ?? "";
    expect(text).toContain("Limits and data safety");
    expect(text).toContain("planning estimates, not lender quotes");
    expect(text).toContain(LIMITS_DOC);
    expect(text).toContain(DATA_SAFETY_DOC);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("uses the same addresses in every language", () => {
    for (const d of Object.values(DICTS)) {
      expect(d.about.limitsText).toBe(LIMITS_DOC);
      expect(d.about.dataSafetyText).toBe(DATA_SAFETY_DOC);
      expect(d.guide.limitsTitle).toBeTruthy();
      expect(d.guide.limitsProse).toBeTruthy();
    }
  });
});

// ADR 0105 (#22): the Guide repeats About's language/formats line in every language.
describe("Guide language note (ADR 0105)", () => {
  it.each(Object.entries(DICTS))("%s shows the formats note", (lang, d) => {
    act(() => useUiStore.setState({ language: lang as keyof typeof DICTS }));
    expect(guideText()).toContain(d.about.formatsNote);
  });
});

// ADR 0116: the mortgages section explains prepayments and maturity changes.
describe("Guide prepayments (ADR 0116)", () => {
  it.each(Object.entries(DICTS))("%s shows the paragraph", (lang, d) => {
    act(() => useUiStore.setState({ language: lang as keyof typeof DICTS }));
    expect(guideText()).toContain(d.guide.mortgagesProse3);
  });

  it("says prepayments stay outside net cash flow and fees do not reduce the debt", () => {
    // ADR 0161: but they are counted in cash to owner and the IRR.
    expect(en.guide.mortgagesProse3).toMatch(
      /outside net cash flow and DSCR, but counted in cash to owner and the IRR/,
    );
    expect(en.guide.mortgagesProse3).toMatch(/does not reduce the debt/);
  });
});
