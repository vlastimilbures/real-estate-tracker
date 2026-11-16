// Vitest setup (vite.config.ts `test.setupFiles`), on only with TEST_AUDIT=1 (#458): records
// how many assertions each test made in its task meta, which the JSON reporter writes out.
// `scripts/test-audit.mjs` compares two such reports, so a test refactor can prove it
// dropped no test and weakened no assertion count.
import { afterEach, expect } from "vitest";

declare module "vitest" {
  interface TaskMeta {
    /** Assertions the test made (`expect.getState().assertionCalls`), audit runs only. */
    assertionCalls?: number;
  }
}

if (process.env.TEST_AUDIT === "1") {
  afterEach(({ task }) => {
    task.meta.assertionCalls = expect.getState().assertionCalls;
  });
}
