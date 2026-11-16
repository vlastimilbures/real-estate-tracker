// Both stores back to their initial state (#458). The setup file
// (src/__tests__/setup/stores.ts) runs it before every ui/state test, so a test sets only
// what differs from the initial state. It imports the stores only, so the setup file loads
// no Testing Library into the node-environment state tests.
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";

/** Put both stores back to the state they were created with (`replace`): every field,
 *  new ones included, and the real actions in place of any a test swapped out. */
export function resetStores(): void {
  usePortfolioStore.setState(usePortfolioStore.getInitialState(), true);
  useUiStore.setState(useUiStore.getInitialState(), true);
}
