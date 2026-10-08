import { usePortfolioStore } from "../../state/portfolioStore";
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
