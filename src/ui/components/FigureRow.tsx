// A row of key figures: label, large value, an optional line under it. The Dashboard's
// Financing panel (ADR 0103) and Property detail's Loan outlook (ADR 0224).
import type { ReactNode } from "react";

export interface Figure {
  /** Unique within the row. */
  id: string;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
}

export function FigureRow({ figures }: { figures: Figure[] }) {
  return (
    <dl className="fx-figures">
      {figures.map((f) => (
        <div className="fx-figure" key={f.id}>
          <dt>{f.label}</dt>
          <dd className="fx-value">{f.value}</dd>
          {f.sub != null && f.sub !== false && (
            <dd className="fx-sub">{f.sub}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
