import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { useT } from "../hooks/useT";
import { Button } from "./primitives";
import { ClearSampleButton } from "./ClearSampleDialog";

/** Says the first-run data is a fictional sample, with "Clear sample and start my own"
 *  and "Keep exploring", which hides it for good (ADR 0094). */
export function SampleBanner() {
  const t = useT();
  const sample = usePortfolioStore((s) => s.sample);
  const dismiss = usePortfolioStore((s) => s.dismissSampleBanner);
  if (!sample.active || sample.dismissed) return null;
  return (
    <div className="banner info" role="note">
      <span>{t.sample.banner}</span>
      <div className="row" style={{ gap: "var(--s2)" }}>
        <ClearSampleButton variant="primary" />
        <Button size="sm" variant="ghost" onClick={() => void dismiss()}>
          {t.sample.keepExploring}
        </Button>
      </div>
    </div>
  );
}

/** After "Clear sample": names the safety backup until dismissed (ADR 0094). */
export function SampleClearedNotice() {
  const t = useT();
  const file = useUiStore((s) => s.sampleClearedBackup);
  const dismiss = useUiStore((s) => s.dismissSampleCleared);
  if (!file) return null;
  return (
    <div className="banner info" role="status">
      <span>{t.sample.cleared(file)}</span>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        {t.common.dismiss}
      </Button>
    </div>
  );
}
