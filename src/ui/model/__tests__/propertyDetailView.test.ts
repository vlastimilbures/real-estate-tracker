// #484: Property detail's view, built from the engine's output without rendering the page.
import { describe, expect, it } from "vitest";
import { isoDate, money, type Portfolio, type Property } from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { getEngineModel } from "../../../state/engineModel";
import { en } from "../../../i18n/en";
import {
  detailSections,
  propertyDetailView,
  propertySubtitle,
  sectionLinks,
  splitResult,
  type PropertyDetailInput,
} from "../propertyDetailView";

const pd = en.propertyDetail;
const today = { date: assumptions.baseDate, isToday: true };

/** The view of property `id` in `p` at the base date. */
function viewOf(
  p: Portfolio,
  id: string,
  over: Partial<PropertyDetailInput> = {},
) {
  const result = getEngineModel(p, assumptions).property(
    id,
    isoDate("2026-10-01"),
  );
  const { out } = splitResult(result);
  const property = p.properties.find((x) => x.id === id)!;
  return propertyDetailView({
    out,
    property,
    portfolio: p,
    assumptions,
    mortgages: p.mortgages.filter((m) => m.propertyId === id),
    mode: "nominal",
    view: today,
    t: en,
    ...over,
  });
}

const loan = portfolio.mortgages[0]!;
const owner = portfolio.properties.find((x) => x.id === loan.propertyId)!;

describe("splitResult (DR-146)", () => {
  it("splits figures from a broken rule; an unknown property has neither", () => {
    expect(splitResult(null)).toEqual({ out: null, invalid: null });
    const broken: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.id === loan.id ? { ...m, monthlyInstalment: money(1) } : m,
      ),
    };
    const bad = splitResult(
      getEngineModel(broken, assumptions).property(
        owner.id,
        isoDate("2026-10-01"),
      ),
    );
    expect(bad.out).toBeNull();
    expect(bad.invalid?.errors[0]?.code).toBe("INSTALMENT_BELOW_INTEREST");
  });
});

describe("propertyDetailView (#484)", () => {
  it("an owned property: tiles, outlook, both exports and the Data check", () => {
    const v = viewOf(portfolio, owner.id);
    const body = v.body!;
    expect(body.tiles.owned).toBe(true);
    expect(body.basis.kind).toBe("today");
    expect(body.pickerHint).toBeNull();
    expect(body.outlook).not.toBeNull();
    expect(body.markerHeading).toBe(en.charts.rateReset);
    expect(body.modeWord).toBe(en.common.nominalLower);
    expect(body.amortization?.months).toBe(body.amortization?.schedule.length);
    expect(body.projection.title).toBe(pd.projectionTitle(30));
    expect(body.projectionExport.rows).toBe(body.projection.rows);
    expect(body.amortizationExport.notes).toEqual([owner.name]);
    expect(body.amortizationExport.filename).toMatch(/amortization/);
    expect(v.check).not.toBeNull();
    expect(v.toReview).toBe(v.check!.attention.length);
    expect(v.subtitle).toBe(
      `${owner.type} · ${pd.sizeM2("71")} · ${pd.purchased("01.06.2015")}`,
    );
  });

  it("the real lens heads the reset markers as nominal (ADR 0210)", () => {
    const body = viewOf(portfolio, owner.id, { mode: "real" }).body!;
    expect(body.markerHeading).toBe(en.charts.rateResetNominal);
    expect(body.modeWord).toBe(en.common.realLower);
  });

  it("a pending purchase is not owned, and the subtitle says so (ADR 0156)", () => {
    const v = viewOf(mixed, "future");
    expect(v.body!.tiles.owned).toBe(false);
    expect(v.subtitle).toBe(pd.pendingPurchase("15.03.2028"));
  });

  it("a deactivated property has figures but no loan warnings or Data check (ADR 0155)", () => {
    const v = viewOf(mixed, "inactive");
    expect(v.body).not.toBeNull();
    expect(v.warnings).toEqual([]);
    expect(v.check).toBeNull();
    expect(v.toReview).toBe(0);
    expect(v.subtitle).toBe(
      `${pd.purchased("01.05.2019")} · ${pd.deactivated}`,
    );
  });

  it("without figures: no body, warnings or Data check, a subtitle without purchase", () => {
    const property = owner;
    const v = propertyDetailView({
      out: null,
      property,
      portfolio,
      assumptions,
      mortgages: [loan],
      mode: "nominal",
      view: { date: new Date(Date.UTC(2030, 0, 1)), isToday: false },
      t: en,
    });
    expect(v.body).toBeNull();
    expect(v.warnings).toEqual([]);
    expect(v.check).toBeNull();
    expect(v.subtitle).toBe(
      `${property.type} · ${pd.sizeM2("71")} · ${pd.asOf("01.01.2030")}`,
    );
  });

  it("a development loan's drawdown percent is the share rounded to a whole number", () => {
    const [dd] = viewOf(mixed, "dev").body!.outlook!.drawdowns;
    expect(dd!.percent).toBe(Math.round(dd!.share.toNumber() * 100));
    expect(dd!.percent).toBe(44);
  });

  it("a loan warning carries its text and a key unique on the page", () => {
    // An instalment far above the annuity pays the loan off early: a warning.
    const fast: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.id === loan.id ? { ...m, loanTermYears: 1 } : m,
      ),
    };
    const v = viewOf(fast, owner.id);
    expect(v.warnings.length).toBeGreaterThan(0);
    for (const w of v.warnings) {
      expect(w.key).toMatch(new RegExp(`-${loan.id}-\\d+$`));
      expect(w.text.length).toBeGreaterThan(0);
    }
    expect(new Set(v.warnings.map((w) => w.key)).size).toBe(v.warnings.length);
  });
});

describe("the page's sections and their nav links (ADR 0107)", () => {
  it("without figures only the record sections", () => {
    expect(detailSections(null, true)).toEqual([
      "records",
      "financing",
      "holding",
    ]);
  });

  it("names each section by its dictionary label and id", () => {
    expect(sectionLinks(en, ["overview", "dataCheck"])).toEqual([
      { id: "pd-overview", label: pd.sectionOverview },
      { id: "pd-dataCheck", label: en.dataCheck.title },
    ]);
  });
});

describe("propertySubtitle (ADR 0156, 0236 §2)", () => {
  const bare: Property = {
    active: true,
    id: "x",
    name: "X",
    purchaseDate: isoDate("2020-02-03"),
    purchasePrice: money(1),
  };
  it("skips what the property does not have", () => {
    expect(propertySubtitle(en, bare, null, today)).toBe("");
    expect(propertySubtitle(en, bare, true, today)).toBe(
      pd.purchased("03.02.2020"),
    );
  });
});
