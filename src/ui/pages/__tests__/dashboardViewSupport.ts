// The Dashboard panels' view slices (#485) from the inputs the tests name: the horizon
// figures for the KPI band, and the lens of the key-figures list, picked as the view does.
import type { Decimal } from "../../../lib/money";
import type { KpiListView, KpiStripView } from "../../model/dashboardView";
import type { LeveredIrr } from "../../model/irr";
import { lensKpis } from "../../model/lensKpis";

export function stripView({
  horizon,
  netWorthMultiple,
  irr,
  ...rest
}: Omit<KpiStripView, "lens"> & {
  horizon: Decimal;
  netWorthMultiple: Decimal | null;
  irr: LeveredIrr;
}): KpiStripView {
  return {
    ...rest,
    lens: { netWorth: horizon, netWorthMultiple, leveredIrr: irr },
  };
}

export function kpiListView(view: Omit<KpiListView, "lens">): KpiListView {
  return { ...view, lens: lensKpis(view.kpis, view.mode) };
}
