import { FolderOpen, PowerOff } from "lucide-react";
import { useUiStore } from "../../state/uiStore";
import type { PortfolioState } from "../model/portfolioState";
import { useT } from "../hooks/useT";
import { Button, EmptyState } from "./primitives";

/** What a portfolio page shows in place of its figures when there is nothing to show
 *  (ADR 0155, #127): no property yet, or every property deactivated. */
export function PortfolioStateNotice({
  state,
}: {
  state: Exclude<PortfolioState, { kind: "ready" }>;
}) {
  const t = useT();
  const navigate = useUiStore((s) => s.navigate);
  if (state.kind === "empty")
    return (
      <EmptyState title={t.common.noPortfolioTitle} icon={FolderOpen}>
        {t.common.noPortfolioBody}
      </EmptyState>
    );
  return (
    <EmptyState
      title={t.common.allInactiveTitle(state.count)}
      icon={PowerOff}
      action={
        <Button variant="primary" onClick={() => navigate("properties")}>
          {t.common.openProperties}
        </Button>
      }
    >
      {t.common.allInactiveBody}
    </EmptyState>
  );
}
