import { Panel, StatList } from "../../components/layout";
import { focusSection } from "../../focus";
import { sectionId } from "../../model/sectionNav";
import { fmtDate } from "../../../lib/format";
import { useT } from "../../hooks/useT";

/** A property not owned yet: when it is bought, and a link to its funding, which the
 *  Acquisition section lists (ADR 0156, 0189). */
export function NotOwnedPanel({ purchaseDate }: { purchaseDate: Date }) {
  const t = useT();
  const d = t.propertyDetail;
  return (
    <Panel title={d.notOwnedTitle} info={d.notOwnedHint}>
      <StatList
        rows={[{ k: t.propertyForm.purchaseDate, v: fmtDate(purchaseDate) }]}
      />
      <button
        type="button"
        className="link-button underlined"
        onClick={() => focusSection(sectionId("acquisition"))}
      >
        {d.notOwnedFundingLink}
      </button>
    </Panel>
  );
}
