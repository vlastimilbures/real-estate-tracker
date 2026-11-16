// Vitest setup (vite.config.ts `test.setupFiles`): every test outside the engine starts on
// PINNED_DAY (#458), so no test reads the day the suite runs on. `vi.setSystemTime`
// without fake timers replaces `Date` only: setTimeout, setInterval and microtasks stay
// real, and `vi.isFakeTimers()` stays false, so Testing Library, user-event and React see
// the same timers as before. A file's own `vi.useFakeTimers(…)` / `vi.setSystemTime(…)`
// runs later (its hooks follow this one) and wins for that test; after a mid-test
// `vi.useRealTimers()` the test calls `setClock(PINNED_DAY)` to get the pin back.
// The top-level call pins the test file's module code as well. Engine tests keep the real
// `Date`: the engine never reads the clock (CLAUDE.md §4), and Stryker runs them as they
// are. They restore it explicitly, since a reused module context (`--no-isolate`, Stryker)
// can carry another file's pin into them.
import { beforeEach, expect, vi } from "vitest";
import { PINNED_DAY, setClock } from "../support/clock";

const ENGINE = /\/src\/engine\//;

if (!ENGINE.test(expect.getState().testPath ?? "")) {
  setClock(PINNED_DAY);
  beforeEach(() => setClock(PINNED_DAY));
} else {
  vi.useRealTimers();
  beforeEach(() => {
    vi.useRealTimers();
  });
}
