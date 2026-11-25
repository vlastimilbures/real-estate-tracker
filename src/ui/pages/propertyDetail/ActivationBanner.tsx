import { Badge, Panel } from "../../components/primitives";
import { ConfirmRow } from "../../components/ConfirmRow";
import type { MutationResult } from "../../../state/portfolioStore";
import { useT } from "../../hooks/useT";

/**
 * Deactivate-confirm and inactive-status banners are mutually exclusive (only one shows
 * at a time), so they're merged into one component rather than two separate conditionals.
 */
export function ActivationBanner({
  propertyName,
  isActive,
  confirmingDeactivate,
  onConfirmDeactivate,
  onCancelDeactivate,
  error,
}: {
  propertyName: string;
  isActive: boolean;
  confirmingDeactivate: boolean;
  /** Deactivates; the confirm stays open with the reason when it fails (UX-050). */
  onConfirmDeactivate: () => Promise<MutationResult>;
  onCancelDeactivate: () => void;
  /** Why the last activation failed, shown in the inactive banner (UX-050). */
  error?: string | null;
}) {
  const t = useT();

  if (confirmingDeactivate) {
    return (
      <Panel flush>
        <ConfirmRow
          message={t.propertyDetail.confirmDeactivate(propertyName)}
          confirmLabel={t.propertyDetail.yesDeactivate}
          busyLabel={t.propertyDetail.deactivating}
          onConfirm={onConfirmDeactivate}
          onCancel={onCancelDeactivate}
        />
      </Panel>
    );
  }

  if (!isActive) {
    return (
      <Panel>
        <span className="inactive-note">
          <Badge band="neutral">{t.propertyDetail.inactiveBadge}</Badge>
          <span>{t.propertyDetail.inactiveNote}</span>
          {/* The page still runs its own figures: a preview before reactivating (ADR 0155). */}
          <span>{t.propertyDetail.inactivePreviewNote}</span>
        </span>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </Panel>
    );
  }

  return null;
}
