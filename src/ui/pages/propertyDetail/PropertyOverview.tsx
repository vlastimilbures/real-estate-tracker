import { AsOfPicker } from "../../components/AsOfPicker";
import type { AsOfBounds } from "../../model/asOf";
import type { PropertyDetailBodyView } from "../../model/propertyDetailView";
import { useT } from "../../hooks/useT";
import { LoanSummary } from "./LoanSummary";
import { PdSection } from "./PdSection";
import { PropertySnapshotTiles } from "./PropertySnapshotTiles";

/** The overview: the as-of picker, the tiles and charts, and the loan's outlook. */
export function PropertyOverview({
  body,
  purchaseDate,
  asOf,
  onAsOf,
  bounds,
}: {
  body: PropertyDetailBodyView;
  purchaseDate: Date;
  /** The picked date; null is Today. */
  asOf: Date | null;
  onAsOf: (date: Date | null) => void;
  bounds: AsOfBounds;
}) {
  const t = useT();
  return (
    <PdSection section="overview">
      <h2 className="sr-only" tabIndex={-1}>
        {t.propertyDetail.sectionOverview}
      </h2>
      <div className="filter-bar">
        <span />
        <AsOfPicker
          value={asOf}
          onChange={onAsOf}
          bounds={bounds}
          hint={body.pickerHint}
        />
      </div>

      <PropertySnapshotTiles
        s={body.tiles}
        chartRows={body.chartRows}
        modeWord={body.modeWord}
        basis={body.basis}
        purchaseDate={purchaseDate}
        markers={body.markers}
        markerHeading={body.markerHeading}
      />
      {/* Right after the charts: the loan's next reset and payoff (ADR 0224 §1). */}
      {body.outlook && <LoanSummary outlook={body.outlook} />}
    </PdSection>
  );
}
