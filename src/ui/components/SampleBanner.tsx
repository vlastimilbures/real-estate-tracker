import { usePortfolioStore } from "../../state/portfolioStore";
import { useT } from "../hooks/useT";
import { Button } from "./Button";
import { ClearSampleButton } from "./ClearSampleDialog";

/** Says the first-run data is a fictional sample, with "Clear sample and start my own"
 *  and "Keep exploring", which hides it for good (ADR 0094). Keep exploring has no
 *  place of its own for a failure, so it goes to the banner (ADR 0261). */
export function SampleBanner() {
  const t = useT();
  const sample = usePortfolioStore((s) => s.sample);
  const dismiss = usePortfolioStore((s) => s.dismissSampleBanner);
  const showError = usePortfolioStore((s) => s.showError);
  if (!sample.active || sample.dismissed) return null;
  return (
    <div className="banner info" role="note">
      <span>{t.sample.banner}</span>
      <div className="row row-s2">
        <ClearSampleButton />
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void dismiss().then((r) => {
              if (!r.ok) showError(r.error);
            })
          }
        >
          {t.sample.keepExploring}
        </Button>
      </div>
    </div>
  );
}
