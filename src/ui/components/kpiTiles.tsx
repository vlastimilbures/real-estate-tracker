// The KPI tiles the Dashboard band and Property detail's snapshot share. Each page
// names the LTV and DSCR tiles its own way and keeps its own reveal delays.
import type { ReactNode } from "react";
import type { PortfolioSnapshot } from "../../engine";
import type { Decimal } from "../../lib/money";
import { monthlyFlow } from "../model/dashboard";
import { dscrBadge, ltvBadge } from "../model/health";
import { useT } from "../hooks/useT";
import { KpiTile } from "./Kpi";
import { Dscr, Money } from "./figures";
import { Pct } from "./rates";

type FlowSnapshot = Pick<
  PortfolioSnapshot,
  "effectiveGrossIncome" | "holdingCosts" | "annualDebtService" | "netCashFlow"
>;

/** Net cash flow: per month, and per year in the foot. */
export function NetCashFlowTile({
  s,
  delay,
}: {
  s: FlowSnapshot;
  delay: number;
}) {
  const d = useT().dashboard;
  const flow = monthlyFlow(s);
  return (
    <KpiTile
      compact
      delay={delay}
      label={d.stripNetCashFlow}
      value={
        <>
          <Money value={flow.net} signed />
          <span className="unit">{d.perMonth}</span>
        </>
      }
      foot={
        <>
          <Money value={s.netCashFlow} />
          {d.perYear}
        </>
      }
    />
  );
}

/** Loan to value, with its health band (ADR 0195). */
export function LtvTile({
  ltv,
  label,
  delay,
}: {
  ltv: Decimal | null;
  label: ReactNode;
  delay: number;
}) {
  const t = useT();
  return (
    <KpiTile
      compact
      delay={delay}
      label={label}
      value={<Pct value={ltv} dp={1} />}
      health={ltvBadge(t, ltv)}
    />
  );
}

/** Debt-service coverage, with its health band; no debt: "—". */
export function DscrTile({
  dscr,
  label,
  delay,
}: {
  dscr: Decimal | null;
  label: ReactNode;
  delay: number;
}) {
  const t = useT();
  return (
    <KpiTile
      compact
      delay={delay}
      label={label}
      value={dscr ? <Dscr value={dscr} /> : "—"}
      health={dscrBadge(t, dscr)}
    />
  );
}
