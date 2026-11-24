// The assumptions, scenario and sample-banner actions of the portfolio store (#465). The
// rules read the store's state inside the queued op, before the write (UX-047).
import type { Scenario } from "../../engine";
import {
  upsertScenario,
  deleteScenario,
  upsertAssumptions,
} from "../../data/repositories";
import { scenarioToRow } from "../../data/mappers";
import { dismissSampleBanner } from "../../data/seed";
import { checkAssumptions, checkScenario } from "./rules";
import type { PortfolioState, StoreCtx } from "./types";

export function scenarioActions({
  mutate,
  get,
}: StoreCtx): Pick<
  PortfolioState,
  | "saveAssumptions"
  | "addScenario"
  | "saveScenario"
  | "duplicateScenario"
  | "removeScenario"
  | "dismissSampleBanner"
> {
  /** Add or save `s`. An insert stamps created_at; an update keeps the stored one
   *  (ADR 0123). */
  const writeScenario = (s: Scenario) =>
    mutate("scenarios", async (sql) => {
      checkScenario(get(), s);
      await upsertScenario(sql, scenarioToRow(s, new Date()));
    });

  return {
    saveAssumptions: (a) =>
      mutate("assumptions", async (sql) => {
        checkAssumptions(get(), a);
        await upsertAssumptions(sql, a);
      }),

    addScenario: (s) => writeScenario(s),
    saveScenario: (s) => writeScenario(s),
    duplicateScenario: (id, newId, name) =>
      mutate("scenarios", async (sql) => {
        const src = get().scenarios.find((x) => x.id === id);
        if (!src) throw new Error("Scenario not found");
        const copy: Scenario = { ...src, id: newId, name };
        checkScenario(get(), copy, src);
        await upsertScenario(sql, scenarioToRow(copy, new Date()));
      }),
    removeScenario: (id) =>
      mutate("scenarios", (sql) => deleteScenario(sql, id)),

    // Hides a banner: app state, not a data change (ADR 0110).
    dismissSampleBanner: () =>
      mutate("bookkeeping", dismissSampleBanner, false),
  };
}
