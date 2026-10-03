// The active-language dictionary for components. Lives in ui/hooks (not src/i18n) so the
// dictionaries never import the state layer (DR-066).
import { useUiStore } from "../../state/uiStore";
import { getDict, type Dictionary } from "../../i18n";

/** Active-language dictionary; re-renders the caller when the language changes. */
export function useT(): Dictionary {
  return getDict(useUiStore((s) => s.language));
}
