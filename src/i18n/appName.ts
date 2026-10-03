// The product name (ADR 0076, ADR 0105): the bundle's `productName`, not translated. Code
// reads it from here; `tauri.conf.json`, `index.html` and the Rust menu cannot import it, so
// `src/__tests__/appName.test.ts` pins them to it.
export const APP_NAME = "Real Estate Tracker";
