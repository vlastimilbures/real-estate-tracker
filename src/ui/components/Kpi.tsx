// KPI tiles and the band that groups them (ADR 0200, ADR 0222).
import { useId, type ReactNode } from "react";
import type { Band } from "../model/health";
import { HealthMarker } from "./status";

/** The KPI band (ADR 0222): one surface holding captioned groups of compact tiles. */
export function KpiBand({ children }: { children: ReactNode }) {
  return (
    <div className="kpi-strip-wrap">
      <div className="kpi-band">{children}</div>
    </div>
  );
}

/** A group of the KPI band, named by its caption: what its figures are for. */
export function KpiBandGroup({
  caption,
  cells,
  children,
}: {
  caption: string;
  /** How many tiles it holds, for its grid (ADR 0222 §3). */
  cells: 2 | 4 | 6;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      className={`kpi-band-group cells-${cells}`}
      role="group"
      aria-labelledby={id}
    >
      <p id={id} className="kpi-band-caption">
        {caption}
      </p>
      <div className="kpi-band-cells">{children}</div>
    </div>
  );
}

export function KpiTile({
  label,
  value,
  foot,
  compact = false,
  health,
  delay = 0,
  testId,
  valueTitle,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode | undefined;
  /** The Dashboard KPI strip's tile: smaller padding and value (ADR 0200). */
  compact?: boolean | undefined;
  /** The band, shown as a marker and its word at the start of the foot (ADR 0195). */
  health?: { band: Band; text: string } | undefined;
  delay?: number | undefined;
  testId?: string | undefined;
  /** The exact value where the tile rounds: the value's tooltip, and read out after it,
   *  as MoneyM does (ADR 0208 §1). */
  valueTitle?: string | undefined;
}) {
  return (
    <div
      className={`tile reveal${compact ? " compact" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="label">{label}</span>
      <div
        className={`value ${compact ? "md" : "lg"}`}
        data-testid={testId}
        title={valueTitle}
      >
        {value}
        {valueTitle && <span className="sr-only"> ({valueTitle})</span>}
      </div>
      {(foot || health) && (
        <div className="foot">
          {health && (
            <>
              <HealthMarker band={health.band} word={health.text} showWord />
              {foot && " · "}
            </>
          )}
          {foot}
        </div>
      )}
    </div>
  );
}
