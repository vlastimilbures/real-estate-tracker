// Property detail's view (#484): everything the page derives from the engine's output, the
// property and the lens, so the page only renders. Pure.
import type {
  AmortizationRow,
  Assumptions,
  MortgageBlock,
  Portfolio,
  Property,
  PropertySnapshot,
} from "../../engine";
import type {
  InvalidPropertyData,
  PropertyEngineOutput,
  PropertyResult,
} from "../../state/engineModel";
import type { Dictionary } from "../../i18n";
import { fmtDate, fmtNumber } from "../../lib/format";
import { exportFilename } from "../../lib/slug";
import type { ResolvedAsOf } from "./asOf";
import { toChartRows, type ChartRow } from "./chartData";
import {
  asOfHint,
  asOfView,
  propertyTilesForAsOf,
  type AsOfBasis,
} from "./dashboard";
import { dataCheckItems } from "./dataCheck";
import { resetMarkers, type ResetMarker } from "./financing";
import { acquisitionView, type AcquisitionView } from "./acquisition";
import {
  projectionColumns,
  projectionSeries,
  type SeriesRow,
} from "./projection";
import {
  amortizationColumns,
  loanOutlook,
  loanWarningText,
  loanWarnings,
  type LoanOutlook,
} from "./propertyDetail";
import {
  propertySections,
  sectionId,
  type PropertySection,
} from "./sectionNav";
import {
  lensLabel,
  lensWord,
  projectionExportNotes,
  projectionPanelHint,
} from "./tableContext";
import type { Mode } from "./lens";
import type { XlsxColumn } from "./xlsxExport";

/** The engine's output for one property (a type-only edge, ADR 0072). */
type PropertyDetailOut = PropertyEngineOutput;

/** What `exportTableXlsx` takes: one sheet. */
export interface TableExport<R> {
  filename: string;
  sheetName: string;
  columns: (rows: R[]) => XlsxColumn<R>[];
  rows: R[];
  notes: string[];
}

/** The parts of the page that exist only with the engine's figures. */
export interface PropertyDetailBodyView {
  /** The tiles under the lens, by the Dashboard's as-of rule (DR-054, D-62). */
  tiles: PropertySnapshot;
  basis: AsOfBasis;
  chartRows: ChartRow[];
  /** The lens as a lower-case word for the charts' subtitles. */
  modeWord: string;
  markers: ResetMarker[];
  markerHeading: string;
  /** The loan's next reset and payoff, right after the charts (ADR 0224 §1). */
  outlook: LoanOutlook | null;
  /** The picker's hint, by the same basis as the tiles (ADR 0088). */
  pickerHint: string | null;
  acquisition: AcquisitionView;
  projection: { title: string; hint: string; rows: SeriesRow[] };
  /** Null without a schedule: no amortization section. */
  amortization: { months: number; schedule: AmortizationRow[] } | null;
  asOf: Date;
  projectionExport: TableExport<SeriesRow>;
  amortizationExport: TableExport<AmortizationRow>;
}

export interface PropertyDetailView {
  /** Null while the stored data breaks an engine rule (DR-146). */
  body: PropertyDetailBodyView | null;
  subtitle: string;
  /** The loan warnings under the blocks they describe (ADR 0107, 0157). */
  warnings: { key: string; text: string }[];
  /** This property's Data check (ADR 0118); none for a deactivated one (ADR 0155). */
  check: ReturnType<typeof dataCheckItems> | null;
  /** The Data check's attention count, also the title pill (ADR 0218 §1). */
  toReview: number;
}

export interface PropertyDetailInput {
  out: PropertyDetailOut | null;
  property: Property;
  portfolio: Portfolio;
  assumptions: Assumptions;
  /** This property's loan blocks. */
  mortgages: MortgageBlock[];
  mode: Mode;
  view: ResolvedAsOf;
  t: Dictionary;
}

/** The engine's result split: its figures, or the rule the stored data breaks (DR-146);
 *  both null for an unknown property. */
export function splitResult(result: PropertyResult): {
  out: PropertyDetailOut | null;
  invalid: InvalidPropertyData["invalid"] | null;
} {
  if (!result) return { out: null, invalid: null };
  return "invalid" in result
    ? { out: null, invalid: result.invalid }
    : { out: result, invalid: null };
}

/** The page's sections in order (ADR 0107); a deactivated property has no Data check
 *  (ADR 0155). */
export function detailSections(
  out: PropertyDetailOut | null,
  isActive: boolean,
): PropertySection[] {
  return propertySections({
    overview: out !== null,
    dataCheck: out !== null && isActive,
    projection: out !== null,
    amortization: out !== null && out.schedule.length > 0,
  });
}

/** The section nav's links. */
export function sectionLinks(t: Dictionary, sections: PropertySection[]) {
  const label: Record<PropertySection, string> = {
    overview: t.propertyDetail.sectionOverview,
    dataCheck: t.dataCheck.title,
    records: t.propertyDetail.sectionRecords,
    financing: t.propertyDetail.sectionFinancing,
    acquisition: t.propertyDetail.sectionAcquisition,
    holding: t.propertyDetail.sectionHolding,
    projection: t.propertyDetail.sectionProjection,
    amortization: t.propertyDetail.sectionAmortization,
  };
  return sections.map((sec) => ({ id: sectionId(sec), label: label[sec] }));
}

/** The subtitle: type, size, purchase or pending purchase (the tiles' own `owned`, so the
 *  two agree, ADR 0156), the as-of date off today, and Deactivated. */
export function propertySubtitle(
  t: Dictionary,
  property: Property,
  owned: boolean | null,
  view: ResolvedAsOf,
): string {
  const d = t.propertyDetail;
  return [
    property.type,
    // Czech formatting, e.g. "54,5 m²" (ADR 0236 §2).
    property.sizeM2 ? d.sizeM2(fmtNumber(property.sizeM2)) : null,
    owned === null
      ? null
      : owned
        ? d.purchased(fmtDate(property.purchaseDate))
        : d.pendingPurchase(fmtDate(property.purchaseDate)),
    view.isToday ? null : d.asOf(fmtDate(view.date)),
    property.active !== false ? null : d.deactivated,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The figures part of the page, from the engine's output. */
export function propertyBodyView(
  out: PropertyDetailOut,
  { property, assumptions, mortgages, mode, view, t }: PropertyDetailInput,
): PropertyDetailBodyView {
  const baseDate = assumptions.baseDate;
  // A future as-of reads the projection year the charts plot; real terms are in base-date
  // prices.
  const series = projectionSeries(out.projection, mode, assumptions);
  const basis = asOfView(baseDate, out.asOf, view.isToday);
  const chartRows = toChartRows(series);
  return {
    tiles: propertyTilesForAsOf(
      out.snapshot,
      series,
      basis,
      out.asOf,
      mode,
      assumptions,
      property.purchaseDate,
    ),
    basis,
    chartRows,
    modeWord: lensWord(t, mode),
    markers: resetMarkers(
      out.financing?.resets ?? [],
      chartRows,
      new Map([[property.id, property.name]]),
    ),
    markerHeading:
      mode === "real" ? t.charts.rateResetNominal : t.charts.rateReset,
    outlook: out.financing
      ? loanOutlook(out.financing, mortgages, t.propertyDetail)
      : null,
    pickerHint: asOfHint(t, basis, baseDate),
    acquisition: acquisitionView(
      out.acquisition,
      property.funding?.note,
      t.propertyDetail,
    ),
    projection: {
      title: t.propertyDetail.projectionTitle(assumptions.horizonYears),
      hint: projectionPanelHint(t, lensLabel(t, mode), baseDate),
      rows: series,
    },
    amortization:
      out.schedule.length > 0
        ? { months: out.schedule.length, schedule: out.schedule }
        : null,
    asOf: out.asOf,
    ...tableExports(out, series, property, mode, baseDate, t),
  };
}

/** The projection (under the lens) and amortization exports. The amortization is always
 *  nominal and dated per row: the property's name is its only context (ADR 0159). */
function tableExports(
  out: PropertyDetailOut,
  series: SeriesRow[],
  property: Property,
  mode: Mode,
  baseDate: Date,
  t: Dictionary,
) {
  return {
    projectionExport: {
      filename: exportFilename(property.name, property.id, "projection", mode),
      sheetName: t.xlsx.sheetNames.projection,
      columns: (rows: SeriesRow[]) => projectionColumns(t, baseDate, rows),
      rows: series,
      notes: projectionExportNotes(t, property.name, mode, baseDate),
    },
    amortizationExport: {
      filename: exportFilename(property.name, property.id, "amortization"),
      sheetName: t.xlsx.sheetNames.amortization,
      columns: (rows: AmortizationRow[]) => amortizationColumns(t, rows),
      rows: out.schedule,
      notes: [property.name],
    },
  };
}

/** The whole page's view. The loan checks and the Data check are skipped while the stored
 *  data breaks an engine rule (they would throw too) and for a deactivated property: no
 *  data-entry nudge for a loan it no longer has (ADR 0155). */
export function propertyDetailView(
  input: PropertyDetailInput,
): PropertyDetailView {
  const { out, property, portfolio, assumptions, mortgages, view, t } = input;
  const body = out ? propertyBodyView(out, input) : null;
  const checked = out && property.active !== false ? out : null;
  // Every block from the one in force onward (UX-054).
  const warnings = checked
    ? loanWarnings(mortgages, assumptions.baseDate, checked.eventOutcomes)
    : [];
  const check = checked
    ? dataCheckItems([property], portfolio, checked.asOf, assumptions.baseDate)
    : null;
  return {
    body,
    subtitle: propertySubtitle(
      t,
      property,
      body ? body.tiles.owned : null,
      view,
    ),
    warnings: warnings.map((w, i) => ({
      key: `${w.kind}-${w.block.id}-${i}`,
      text: loanWarningText(t, w, assumptions.postFixationResetRatePa),
    })),
    check,
    toReview: check?.attention.length ?? 0,
  };
}
