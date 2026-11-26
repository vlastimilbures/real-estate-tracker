// DOM stubs for jsdom tests (#458).

/** A no-op ResizeObserver, which Recharts' ResponsiveContainer needs and jsdom lacks. An
 *  observer already installed is kept. */
export function stubResizeObserver(): void {
  // eslint-disable-next-line no-restricted-syntax -- the one shared stub the rule points to
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
