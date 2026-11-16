// Vitest setup (vite.config.ts `test.setupFiles`): the two modules that reach the Tauri
// bridge are mocked once for every ui/state test (#458), so a test file does not repeat
// the mock. Each mock is a spy over the real function, so a test that sets nothing sees
// the real behaviour (a no-op outside Tauri for `logFailure`); a test that needs other
// behaviour sets it on the spy, e.g. `vi.mocked(invoke).mockResolvedValue(undefined)`.
// `vi.doMock` is not hoisted, so it can be skipped outside ui/state; a file's own
// `vi.mock` of the same module, registered later, still wins (lint forbids one there).
import { expect, vi } from "vitest";

const STATEFUL = /\/src\/(ui|state)\//;

if (STATEFUL.test(expect.getState().testPath ?? "")) {
  vi.doMock("../../data/errorLog", async (importOriginal) => {
    const real = await importOriginal<typeof import("../../data/errorLog")>();
    return { ...real, logFailure: vi.fn(real.logFailure) };
  });
  vi.doMock("@tauri-apps/api/core", async (importOriginal) => {
    const real = await importOriginal<typeof import("@tauri-apps/api/core")>();
    return { ...real, invoke: vi.fn(real.invoke) };
  });
}
