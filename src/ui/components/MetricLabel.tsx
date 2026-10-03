import type { ReactNode } from "react";
import { useUiStore } from "../../state/uiStore";
import { type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";

export type GlossaryTerm = keyof Dictionary["guide"]["glossary"];

/**
 * A metric abbreviation (LTV, DSCR, NOI, …) that explains itself (UX-044): hovering or
 * focusing shows the glossary definition, and activating it opens the Guide at the term.
 */
export function MetricLabel({
  term,
  children,
}: {
  term: GlossaryTerm;
  children: ReactNode;
}) {
  const t = useT();
  const openGuide = useUiStore((s) => s.openGuide);
  return (
    <button
      type="button"
      className="metric-term"
      title={t.guide.glossary[term].def}
      onClick={(e) => {
        e.stopPropagation();
        openGuide(term);
      }}
    >
      {children}
    </button>
  );
}
