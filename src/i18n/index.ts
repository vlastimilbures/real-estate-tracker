// i18n entry point: the dictionaries. Components read them through `useT()`
// (src/ui/hooks/useT.ts) as `t.namespace.key` (or `t.namespace.key(params)`); switching
// language in uiStore re-renders them. This module imports no state (DR-066).
//
// Each dictionary is its own chunk, loaded on demand, so startup carries only the active
// language (DR-009). The store loads a language before it shows it — at startup and on a
// switch — so `getDict` is only ever asked for a loaded one.
import type { Dictionary } from "./en";
import type { Language } from "./types";

export type { Dictionary } from "./en";
export type { Language } from "./types";
export { LANGUAGES } from "./types";
export { APP_NAME } from "./appName";

const LOADERS: Record<Language, () => Promise<Dictionary>> = {
  en: () => import("./en").then((m) => m.en),
  cs: () => import("./cs").then((m) => m.cs),
  ru: () => import("./ru").then((m) => m.ru),
};

const loaded: Partial<Record<Language, Dictionary>> = {};
const loading: Partial<Record<Language, Promise<Dictionary>>> = {};

/** Load a language's dictionary once; concurrent callers share the load, and a failed
 *  load can be retried. */
export function loadDictionary(lang: Language): Promise<Dictionary> {
  loading[lang] ??= LOADERS[lang]().then(
    (dict) => {
      loaded[lang] = dict;
      return dict;
    },
    (error: unknown) => {
      delete loading[lang];
      throw error;
    },
  );
  return loading[lang];
}

export function isDictionaryLoaded(lang: Language): boolean {
  return loaded[lang] !== undefined;
}

/** The dictionary for a loaded language (for non-hook contexts). App code asks only for
 *  the active language; tests preload all three (__tests__/preload.ts), so they would not
 *  catch a call for another one. */
export function getDict(lang: Language): Dictionary {
  const dict = loaded[lang];
  if (!dict)
    throw new Error(`i18n: dictionary "${lang}" used before loadDictionary`);
  return dict;
}
