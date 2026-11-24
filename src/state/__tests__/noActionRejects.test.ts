// #467: no store action rejects. Every write, read and whole-database action resolves
// with a result, whether the database fails, is not open yet, or a read-back failed;
// the caller branches on `ok` and never needs a catch.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePortfolioStore, portfolioDb } from "../portfolioStore";
import { exportToJson, type BackupFile } from "../../data/backup";
import type { Sql } from "../../data/sql";
import type { PortfolioState } from "../portfolio/types";
import { openSeeded } from "./support/openSeeded";

vi.mocked(invoke).mockResolvedValue(undefined);

/** A database whose every call fails. */
const failing: Sql = {
  execute: () => Promise.reject(new Error("disk I/O error")),
  select: () => Promise.reject(new Error("disk I/O error")),
  transaction: () => Promise.reject(new Error("disk I/O error")),
  selectSnapshot: () => Promise.reject(new Error("disk I/O error")),
  backup: () => Promise.reject(new Error("disk I/O error")),
};

/** Any record: the failure comes before its fields matter, or from them. */
const any = {} as never;
let file: BackupFile;

/** Each store action that returns a promise, called once. */
const actions: [
  name: keyof PortfolioState,
  run: (s: PortfolioState) => Promise<unknown>,
][] = [
  ["addValuation", (s) => s.addValuation(any)],
  [
    "addValuationClosingPrevious",
    (s) => s.addValuationClosingPrevious(any, any),
  ],
  ["saveValuation", (s) => s.saveValuation(any)],
  ["removeValuation", (s) => s.removeValuation("v")],
  ["addLease", (s) => s.addLease(any)],
  ["saveLease", (s) => s.saveLease(any)],
  ["removeLease", (s) => s.removeLease("l")],
  ["addMortgageBlock", (s) => s.addMortgageBlock(any)],
  ["saveMortgageBlock", (s) => s.saveMortgageBlock(any)],
  ["removeMortgageBlock", (s) => s.removeMortgageBlock("m")],
  ["saveHoldingCost", (s) => s.saveHoldingCost(any)],
  ["addProperty", (s) => s.addProperty(any, any, any)],
  ["editProperty", (s) => s.editProperty(any, any)],
  ["getPropertyExtras", (s) => s.getPropertyExtras("p")],
  ["setPropertyActive", (s) => s.setPropertyActive("p", false)],
  ["removeProperty", (s) => s.removeProperty("p")],
  ["saveAssumptions", (s) => s.saveAssumptions(any)],
  ["addScenario", (s) => s.addScenario(any)],
  ["saveScenario", (s) => s.saveScenario(any)],
  ["duplicateScenario", (s) => s.duplicateScenario("s", "copy", "Copy")],
  ["removeScenario", (s) => s.removeScenario("s")],
  ["dismissSampleBanner", (s) => s.dismissSampleBanner()],
  ["previewCsv", (s) => s.previewCsv({})],
  ["importCsv", (s) => s.importCsv({})],
  ["restoreBackup", (s) => s.restoreBackup(file)],
  ["restoreAtStartup", (s) => s.restoreAtStartup(file)],
  ["clearSample", (s) => s.clearSample()],
  ["loadSample", (s) => s.loadSample()],
  ["exportBackup", (s) => s.exportBackup()],
];

const store = () => usePortfolioStore.getState();

beforeEach(async () => {
  const sql = await openSeeded();
  file = await exportToJson(sql, new Date());
});

describe("no store action rejects (#467)", () => {
  it("lists every action that returns a promise, init and refresh aside", () => {
    const listed = new Set(actions.map(([name]) => name));
    const promised = Object.entries(store())
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k as keyof PortfolioState)
      .filter(
        (k) =>
          ![
            "init",
            "refresh",
            "clearError",
            "showError",
            "continueAfterRestore",
          ].includes(k),
      );
    expect(promised.filter((k) => !listed.has(k))).toEqual([]);
  });

  it.each(actions)(
    "%s resolves before the database is open",
    async (_, run) => {
      await expect(run(store())).resolves.toHaveProperty("ok");
    },
  );

  it.each(actions)("%s resolves when the database fails", async (_, run) => {
    const sql = await openSeeded();
    await store().init(async () => sql);
    portfolioDb.set(failing);
    await expect(run(store())).resolves.toHaveProperty("ok", false);
  });

  it.each(actions)("%s resolves after a failed read-back", async (_, run) => {
    const sql = await openSeeded();
    await store().init(async () => sql);
    usePortfolioStore.setState({
      status: { kind: "readBackFailed", refused: [] },
    });
    await expect(run(store())).resolves.toHaveProperty("ok");
  });
});
