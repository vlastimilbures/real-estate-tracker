// Where focus goes once a control inside a panel has closed, found through React rather
// than by climbing the DOM to a class.
import { createContext } from "react";

/** The section of the `<Panel>` around a component, or null outside one: where focus goes
 *  once a confirm row inside it has closed (ADR 0173). Panel provides it. */
export const PanelSection = createContext<() => HTMLElement | null>(() => null);

/** Whether `el` is inside a confirm row (ConfirmRow.tsx), which places focus itself
 *  (ADR 0173, ADR 0248 §1): for a busy action's focus rule. */
export const inConfirmRow = (el: Element): boolean =>
  el.closest(".confirm-row") !== null;
