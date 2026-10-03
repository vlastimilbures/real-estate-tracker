// i18n entry point: the dictionaries. Components read them through `useT()`
// (src/ui/hooks/useT.ts) as `t.namespace.key` (or `t.namespace.key(params)`); switching
// language in uiStore re-renders them. This module imports no state (DR-066).
import { en, type Dictionary } from "./en";
import { cs } from "./cs";
import { ru } from "./ru";
import type { Language } from "./types";

export type { Dictionary } from "./en";
export type { Language } from "./types";
export { LANGUAGES } from "./types";
export { APP_NAME } from "./appName";

const DICTIONARIES: Record<Language, Dictionary> = { en, cs, ru };

/** The dictionary for a given language (for non-hook contexts). */
export function getDict(lang: Language): Dictionary {
  return DICTIONARIES[lang];
}
