// Vitest setup (vite.config.ts `test.setupFiles`): the app loads one dictionary at a time
// (DR-009); tests read any language synchronously through getDict, so load all three.
import { LANGUAGES, loadDictionary } from "../index";

await Promise.all(LANGUAGES.map((l) => loadDictionary(l.value)));
