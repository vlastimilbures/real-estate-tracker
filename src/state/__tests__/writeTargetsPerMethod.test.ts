// ADR 0255 (#446): every public write method names what it changes. Refused while a
// read-back has failed, each keeps its own target for the error screen; the bookkeeping
// writes (dismissing the sample banner, recording an export) keep none, and a restore
// from the startup screen refuses before it queues anything.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortfolioStore } from "../portfolioStore";
import { openMemorySql, type TestSql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { seedIfEmpty } from "../../data/seed";
import { invoke } from "@tauri-apps/api/core";
import { exportToJson, type BackupFile } from "../../data/backup";
import { saveFile } from "../../platform/saveFile";
import type { WriteTarget } from "../writeTargets";
import {
  readBackFailedOf,
  refusedWritesOf,
} from "../../__tests__/support/status";

vi.mocked(invoke).mockResolvedValue(undefined);
vi.mock("../../platform/saveFile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveFile: vi.fn(async () => ({ kind: "saved", filename: "export.json" })),
}));

let db: TestSql;
let file: BackupFile;

beforeEach(async () => {
  db = openMemorySql();
  await usePortfolioStore.getState().init(async () => {
    await migrate(db);
    await seedIfEmpty(db);
    return db;
  });
  file = await exportToJson(db, new Date());
});

const store = () => usePortfolioStore.getState();
const readBackFails = () =>
  usePortfolioStore.setState({
    status: { kind: "readBackFailed", refused: [] },
  });
/** Any record: a refused write never reads its arguments. */
const any = {} as never;

/** Record an export whose save dialog closes after the read-back failed, so only the
 *  recording write is refused. */
async function recordBackup() {
  let close!: () => void;
  const dialog = new Promise<void>((r) => (close = r));
  vi.mocked(saveFile).mockImplementationOnce(async () => {
    await dialog;
    return { kind: "saved", filename: "export.json" };
  });
  const exported = store().exportBackup();
  await vi.waitFor(() => expect(saveFile).toHaveBeenCalled());
  readBackFails();
  close();
  return exported;
}

/** Call the method once a read-back has failed. */
const refused = (call: () => Promise<unknown>) => (): Promise<unknown> => {
  readBackFails();
  return call();
};

describe("each write method's target (ADR 0255)", () => {
  it.each<{ method: string; kept: WriteTarget[]; run: () => Promise<unknown> }>(
    [
      {
        method: "addValuation",
        kept: ["valuations"],
        run: refused(() => store().addValuation(any)),
      },
      {
        method: "addValuationClosingPrevious",
        kept: ["valuations"],
        run: refused(() => store().addValuationClosingPrevious(any, any)),
      },
      {
        method: "saveValuation",
        kept: ["valuations"],
        run: refused(() => store().saveValuation(any)),
      },
      {
        method: "removeValuation",
        kept: ["valuations"],
        run: refused(() => store().removeValuation("v")),
      },
      {
        method: "addLease",
        kept: ["leases"],
        run: refused(() => store().addLease(any)),
      },
      {
        method: "saveLease",
        kept: ["leases"],
        run: refused(() => store().saveLease(any)),
      },
      {
        method: "removeLease",
        kept: ["leases"],
        run: refused(() => store().removeLease("l")),
      },
      {
        method: "addMortgageBlock",
        kept: ["mortgage_blocks"],
        run: refused(() => store().addMortgageBlock(any)),
      },
      {
        method: "saveMortgageBlock",
        kept: ["mortgage_blocks"],
        run: refused(() => store().saveMortgageBlock(any)),
      },
      {
        method: "removeMortgageBlock",
        kept: ["mortgage_blocks"],
        run: refused(() => store().removeMortgageBlock("m")),
      },
      {
        method: "saveHoldingCost",
        kept: ["holding_costs"],
        run: refused(() => store().saveHoldingCost(any)),
      },
      {
        method: "addProperty",
        kept: ["properties"],
        run: refused(() => store().addProperty(any, any, any)),
      },
      {
        method: "editProperty",
        kept: ["properties"],
        run: refused(() => store().editProperty(any, any)),
      },
      {
        method: "setPropertyActive",
        kept: ["properties"],
        run: refused(() => store().setPropertyActive("p", false)),
      },
      {
        method: "removeProperty",
        kept: ["properties"],
        run: refused(() => store().removeProperty("p")),
      },
      {
        method: "saveAssumptions",
        kept: ["assumptions"],
        run: refused(() => store().saveAssumptions(any)),
      },
      {
        method: "addScenario",
        kept: ["scenarios"],
        run: refused(() => store().addScenario(any)),
      },
      {
        method: "saveScenario",
        kept: ["scenarios"],
        run: refused(() => store().saveScenario(any)),
      },
      {
        method: "duplicateScenario",
        kept: ["scenarios"],
        run: refused(() => store().duplicateScenario("s", "copy", "Copy")),
      },
      {
        method: "removeScenario",
        kept: ["scenarios"],
        run: refused(() => store().removeScenario("s")),
      },
      {
        method: "importCsv",
        kept: ["importCsv"],
        run: refused(() => store().importCsv({})),
      },
      {
        method: "restoreBackup",
        kept: ["restore"],
        run: refused(() => store().restoreBackup(file)),
      },
      {
        method: "clearSample",
        kept: ["clearSample"],
        run: refused(() => store().clearSample()),
      },
      {
        method: "loadSample",
        kept: ["loadSample"],
        run: refused(() => store().loadSample()),
      },
      // Bookkeeping, and a restore that refuses before it is queued: nothing kept.
      {
        method: "dismissSampleBanner",
        kept: [],
        run: refused(() => store().dismissSampleBanner()),
      },
      { method: "recordBackup (exportBackup)", kept: [], run: recordBackup },
      {
        method: "restoreAtStartup",
        kept: [],
        run: refused(() => store().restoreAtStartup(file)),
      },
    ],
  )("$method keeps $kept", async ({ run, kept }) => {
    await Promise.allSettled([run()]);
    expect(readBackFailedOf(store())).toBe(true);
    expect(refusedWritesOf(store())).toEqual(kept);
  });
});
