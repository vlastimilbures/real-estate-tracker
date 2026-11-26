import { useState } from "react";
import { useUiStore } from "../../../state/uiStore";
import { useT } from "../../hooks/useT";
import { Button, SegmentedToggle } from "../../components/primitives";
import type { LoanType } from "../../model/mortgageForm";

/** Standard | Development switch for the mortgage form, plus the successor-block note
 *  on Add when the property already has a block (ADR 0098). The chosen type lives in
 *  the draft under `loanType`; `onSet` stores it, and for Standard clears what it drops. */
export function LoanTypeSwitch({
  type,
  dataType,
  onSet,
  successorNote,
}: {
  /** The chosen type. */
  type: LoanType;
  /** The type the draft's data shows (a tranche row worth saving, a completion date). */
  dataType: LoanType;
  onSet: (next: LoanType) => void;
  successorNote: boolean;
}) {
  const t = useT();
  const d = t.propertyDetail;
  const openGuide = useUiStore((s) => s.openGuide);
  const [confirming, setConfirming] = useState(false);

  function choose(next: LoanType) {
    if (next === type) return;
    if (next === "standard" && dataType === "development") {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onSet(next);
  }

  return (
    <div className="loan-type">
      {successorNote && (
        <p className="form-note">
          {d.successorNote}{" "}
          <button
            type="button"
            className="link-button underlined"
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
          <div className="row row-s2">
            <Button size="sm" onClick={() => setConfirming(false)}>
              {d.loanTypeKeepDevelopment}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onSet("standard");
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
