// Applies the appearance preference to <html data-theme>. The CSS in tokens.css keys
// its dark palette off [data-theme="dark"]; everything else reads CSS variables, so
// flipping this one attribute re-themes the whole app (charts included — CSS vars
// resolve inside SVG). Kept free of React/store imports so main.tsx can call it before
// first paint (no light-flash) without pulling in the store. The stored preference
// itself lives in src/state/themePreference.ts (ADR 0072, DR-165).
import type { Theme } from "../state/themePreference";

const darkQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

/** The concrete light/dark value a preference resolves to right now. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return darkQuery()?.matches ? "dark" : "light";
  return theme;
}

/** Set <html data-theme> to the resolved value. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(theme);
}

/**
 * Subscribe to OS appearance changes. Returns an unsubscribe fn. The callback only
 * matters while the preference is "system"; callers gate on that.
 */
export function onSystemThemeChange(cb: () => void): () => void {
  const mq = darkQuery();
  if (!mq) return () => {};
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
