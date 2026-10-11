// Vitest setup (vite.config.ts `test.setupFiles`): jsdom lacks two browser APIs the UI
// touches. Stub them once here instead of per file (#141). Node-environment files skip it.
if (typeof window !== "undefined") {
  // jsdom defines scrollTo but logs "Not implemented" on every call.
  window.scrollTo = () => {};
  // No matchMedia in jsdom: answer "no match", the same as the app's fallback when the
  // API is missing (src/ui/theme.ts, src/ui/hooks/usePrefersReducedMotion.ts). A test
  // that needs a match stubs its own (vi.stubGlobal).
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
