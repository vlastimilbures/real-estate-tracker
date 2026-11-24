// Shared UI test world (#458): a page rendered on a given portfolio. The stores start
// each ui/state test in their initial state (support/resetStores.ts, run by
// src/__tests__/setup/stores.ts), so a test names only what differs.
import type { ReactElement } from "react";
import { act, render, type RenderResult } from "@testing-library/react";
import type { Assumptions, Portfolio } from "../../engine";
import { assumptions, portfolio } from "../../engine/__tests__/support/seed";
import type { Language } from "../../i18n/types";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore, type Route } from "../../state/uiStore";

interface World {
  /** Default: the sample portfolio (engine/__tests__/support/seed). */
  portfolio?: Portfolio;
  /** Default: the sample assumptions. */
  assumptions?: Assumptions;
  /** Set only when given; otherwise the store keeps what it has. */
  language?: Language;
  route?: Route;
  asOf?: Date | null;
}

/** Load `world` into the stores (portfolio ready) and render `ui`. Store fields it does
 *  not name keep the values the test set before. */
export function renderWithPortfolio(
  ui: ReactElement,
  world: World = {},
): RenderResult {
  act(() => {
    usePortfolioStore.setState({
      portfolio: world.portfolio ?? portfolio,
      assumptions: world.assumptions ?? assumptions,
      status: { kind: "ready" },
    });
    const view: Pick<World, "language" | "route" | "asOf"> = {};
    if (world.language !== undefined) view.language = world.language;
    if (world.route !== undefined) view.route = world.route;
    if (world.asOf !== undefined) view.asOf = world.asOf;
    useUiStore.setState(view);
  });
  return render(ui);
}
