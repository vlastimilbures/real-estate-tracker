// Vitest setup (vite.config.ts `test.setupFiles`): every ui/state test starts with both
// stores in their initial state (#458), so no test inherits the one before it and a test
// file needs no hand-written reset. The import is dynamic and inside the hook: by then the
// test file's own `vi.mock` calls are registered, so the stores load against them, and
// engine, data and other tests never load the state layer at all.
import { beforeEach } from "vitest";

const STATEFUL = /\/src\/(ui|state)\//;

beforeEach(async ({ task }) => {
  if (!STATEFUL.test(task.file.filepath)) return;
  const { resetStores } = await import("../support/resetStores");
  resetStores();
});
