import { useState } from "react";
import { useUiStore } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import { Button, SegmentedToggle } from "./primitives";
import { loanTypeOf, type LoanType } from "../model/mortgageForm";

/** Standard | Development switch for the mortgage form, plus the successor-block note
 *  on Add when the property already has a block (ADR 0098). The chosen type lives in
 *  the draft under `loanType`. */
export function LoanTypeSwitch({
  draft,
  patch,
  successorNote,
}: {
  draft: Record<string, string>;
  patch: (p: Record<string, string>) => void;
  successorNote: boolean;
}) {
  const t = useT();
  const d = t.propertyDetail;
  const openGuide = useUiStore((s) => s.openGuide);
  const [confirming, setConfirming] = useState(false);
  const type = (draft.loanType ?? loanTypeOf(draft)) as LoanType;

  function choose(next: LoanType) {
    if (next === type) return;
    if (next === "standard" && loanTypeOf(draft) === "development") {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    // Back to Standard with nothing worth keeping: drop any blank tranche row too, so a
    // hidden row does not leave the form unsaved.
    patch(
      next === "standard"
        ? { loanType: next, draws: "", completionDate: "" }
        : { loanType: next },
    );
  }

  return (
    <div className="loan-type">
      {successorNote && (
        <p className="form-note">
          {d.successorNote}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => openGuide("fixation")}
          >
            {d.successorLearnMore}
          </button>
        </p>
      )}
      <div className="loan-type-row">
        <span className="loan-type-label">{d.loanType}</span>
        <SegmentedToggle<LoanType>
          ariaLabel={d.loanType}
          value={type}
          onChange={choose}
          options={[
            { value: "standard", label: d.loanTypeStandard },
            { value: "development", label: d.loanTypeDevelopment },
          ]}
        />
      </div>
      {confirming && (
        <div className="loan-type-confirm" role="alert">
          <span className="confirm-msg">{d.loanTypeClearWarning}</span>
          <div className="row" style={{ gap: "var(--s2)" }}>
            <Button size="sm" onClick={() => setConfirming(false)}>
              {d.loanTypeKeepDevelopment}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setConfirming(false);
                patch({ loanType: "standard", draws: "", completionDate: "" });
              }}
            >
              {d.loanTypeClearAndSwitch}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
