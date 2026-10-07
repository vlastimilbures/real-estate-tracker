// Backup file orchestration against a fake of the app's file commands
// (src-tauri/src/files.rs): the pre-restore safety backup (DR-019, D-52), the restore
// pick (DR-138) and the export outcome (DR-026). The fake mirrors the Rust contract;
// the temp + rename write and its read-back are tested in src-tauri/tests/files.rs.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import {
  BACKUP_MAX_BYTES,
  BackupExportError,
  chooseRestoreFile,
  confirmRestore,
  exportBackup,
  exportToJson,
  RestoreError,
  SafetyBackupError,
  writeSafetyBackup,
  type BackupFile,
} from "../backup";
import { checkInputRules } from "../../import/inputRules";
import { localIsoDay } from "../../lib/today";
import { saveFile } from "../../platform/saveFile";

/** The files the fake commands wrote, by full path. */
const files = vi.hoisted(() => new Map<string, string>());
/** What the fake dialogs and disk do; reset before each test. */
const rust = vi.hoisted(() => ({
  /** Path picked in the save dialog (null = cancelled). */
  savePick: null as string | null,
  /** Result of the open dialog: a file, null (cancelled) or an error code. */
  openPick: null as { name: string; text: string } | null | string,
  /** A write error to raise, if any. */
  writeError: null as string | null,
  /** What a written file reads back as. */
  readBack: (_path: string, text: string): string => text,
}));
const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

type Headers = { headers: Record<string, string> };

async function fakeInvoke(
  command: string,
  args: unknown,
  options?: Headers,
): Promise<unknown> {
  switch (command) {
    case "save_file": {
      // The options header must decode (Rust rejects the call otherwise).
      JSON.parse(decodeURIComponent(options!.headers["x-save-options"]));
      if (rust.savePick === null) return { kind: "cancelled" };
      if (rust.writeError) throw rust.writeError;
      const text = new TextDecoder().decode(args as Uint8Array);
      files.set(rust.savePick, text);
      if (rust.readBack(rust.savePick, text) !== text)
        throw "the saved file does not match";
      return { kind: "saved", filename: rust.savePick.split("/").pop() };
    }
    case "open_backup_file":
      if (typeof rust.openPick === "string") throw rust.openPick;
      return rust.openPick;
    case "write_app_backup": {
      const { filename, json } = args as { filename: string; json: string };
      if (rust.writeError) throw rust.writeError;
      const path = `/app-config/backups/${filename}`;
      files.set(path, json);
      return rust.readBack(path, json);
    }
    default:
      throw new Error(`unexpected command ${command}`);
  }
}

/** The file name suggested to the save dialog. */
function suggestedName(): string {
  const call = core.invoke.mock.calls.find(([c]) => c === "save_file") as [
    string,
    Uint8Array,
    Headers,
  ];
  return (
    JSON.parse(decodeURIComponent(call[2].headers["x-save-options"])) as {
      filename: string;
    }
  ).filename;
}

let sql: TestSql;

beforeEach(async () => {
  files.clear();
  rust.savePick = null;
  rust.openPick = null;
  rust.writeError = null;
  rust.readBack = (_path, text) => text;
  core.invoke.mockReset().mockImplementation(fakeInvoke);
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});

afterEach(() => sql.db.close());

async function propertyCount(): Promise<number> {
  return (await sql.select("SELECT id FROM properties")).length;
}

/** A valid backup holding an empty portfolio — restoring it would wipe everything. */
async function emptyBackup(): Promise<BackupFile> {
  const b = await exportToJson(sql);
  return {
    ...b,
    tables: {
      ...b.tables,
      properties: [],
      mortgage_blocks: [],
      valuations: [],
      leases: [],
      holding_costs: [],
    },
  };
}

/** Every command the code under test called, in order. */
function commands(): string[] {
  return core.invoke.mock.calls.map(([c]) => c as string);
}

describe("confirmRestore — safety backup (DR-019, D-52)", () => {
  it("aborts without touching the DB when the safety backup cannot be written", async () => {
    rust.writeError = "disk full";
    const backup = await emptyBackup();

    const err = await confirmRestore(sql, backup, checkInputRules).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SafetyBackupError);
    expect((err as Error).message).toMatch(/disk full/);
    expect(await propertyCount()).toBe(3);
  });

  it("aborts when the saved copy does not read back complete", async () => {
    rust.readBack = (_path, text) => {
      const saved = JSON.parse(text) as BackupFile;
      return JSON.stringify({
        ...saved,
        tables: { ...saved.tables, leases: [] },
      });
    };
    const err = await confirmRestore(
      sql,
      await emptyBackup(),
      checkInputRules,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SafetyBackupError);
    expect((err as Error).message).toMatch(/leases/);
    expect(await propertyCount()).toBe(3);
  });

  it("refuses an invalid backup before writing any safety file", async () => {
    const backup = await emptyBackup();
    const bad = { ...backup, tables: { ...backup.tables, assumptions: [] } };
    await expect(
      confirmRestore(sql, bad, checkInputRules),
    ).rejects.toBeInstanceOf(RestoreError);
    expect(core.invoke).not.toHaveBeenCalled();
    expect(await propertyCount()).toBe(3);
  });

  // ADR 0123: a scenario row is read before the safety file, like every other row.
  it("refuses a scenario it cannot read before writing any safety file", async () => {
    const backup = await emptyBackup();
    const bad = {
      ...backup,
      tables: {
        ...backup.tables,
        scenarios: [
          {
            id: "s1",
            name: null,
            overrides: '{"version":1}',
            created_at: "2026-01-05T10:00:00.000Z",
          },
        ],
      },
    };
    await expect(
      confirmRestore(sql, bad, checkInputRules),
    ).rejects.toBeInstanceOf(RestoreError);
    expect(core.invoke).not.toHaveBeenCalled();
    expect(await propertyCount()).toBe(3);
  });

  // ADR 0128 §7: the cross-field rules are not checked on restore. A scenario whose rate
  // shock takes the reset rate below 0 restores like one already saved (ADR 0123 §4).
  it("restores a scenario that breaks a cross-field rule", async () => {
    const backup = await emptyBackup();
    const withScenario = {
      ...backup,
      tables: {
        ...backup.tables,
        scenarios: [
          {
            id: "s1",
            name: "Negative rate",
            overrides:
              '{"version":1,"rateShock":{"deltaPa":"-0.5","durationYears":3}}',
            created_at: "2026-01-05T10:00:00.000Z",
          },
        ],
      },
    };
    await confirmRestore(sql, withScenario, checkInputRules);
    expect(await sql.select("SELECT id FROM scenarios")).toEqual([
      { id: "s1" },
    ]);
  });

  it("writes the safety backup to the app's backups folder, then restores", async () => {
    const backup = await emptyBackup();

    const { safetyBackup } = await confirmRestore(sql, backup, checkInputRules);
    expect(safetyBackup).toMatch(
      /^portfolio-before-restore-\d{8}T\d{6}Z\.json$/,
    );
    expect(commands()).toEqual(["write_app_backup"]);
    expect(core.invoke).toHaveBeenCalledWith("write_app_backup", {
      filename: safetyBackup,
      json: expect.any(String),
    });
    const path = `/app-config/backups/${safetyBackup}`;
    expect([...files.keys()]).toEqual([path]);
    expect(
      (JSON.parse(files.get(path)!) as BackupFile).tables.properties,
    ).toHaveLength(3);
    expect(await propertyCount()).toBe(0);
  });
});

describe("writeSafetyBackup — reading the data is part of it (ADR 0147)", () => {
  it("a failed read of the current data is a SafetyBackupError (#122)", async () => {
    const failing = {
      ...sql,
      selectSnapshot: () => Promise.reject(new Error("disk I/O error")),
    };
    const err = await writeSafetyBackup(failing).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SafetyBackupError);
    expect(commands()).toEqual([]);
  });
});

describe("chooseRestoreFile — the picked backup (DR-138)", () => {
  it("returns null when the open dialog is cancelled", async () => {
    expect(await chooseRestoreFile(checkInputRules)).toBeNull();
    expect(core.invoke).toHaveBeenCalledWith("open_backup_file", {
      maxBytes: BACKUP_MAX_BYTES,
    });
  });

  it("an oversized file is refused with the D-53 message before it is read", async () => {
    rust.openPick = "BACKUP_TOO_LARGE";
    const err = await chooseRestoreFile(checkInputRules).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RestoreError);
    expect((err as RestoreError).code).toBe("BACKUP_TOO_LARGE");
    expect((err as Error).message).toBe(
      "The backup file is larger than 20 MB.",
    );
  });

  it("a file that cannot be read is a BackupReadError (#122)", async () => {
    rust.openPick = "Operation not permitted (os error 1)";
    const err = await chooseRestoreFile(checkInputRules).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({
      name: "BackupReadError",
      detail: "Operation not permitted (os error 1)",
    });
  });

  it("a picked file is checked completely and named", async () => {
    rust.openPick = {
      name: "my-backup.json",
      text: JSON.stringify(await exportToJson(sql)),
    };
    const picked = await chooseRestoreFile(checkInputRules);
    expect(picked?.file).toBe("my-backup.json");
    expect(picked?.backup.tables.properties).toHaveLength(3);
  });

  it("a picked file that is not JSON is refused", async () => {
    rust.openPick = { name: "x.json", text: "not json" };
    const err = await chooseRestoreFile(checkInputRules).catch(
      (e: unknown) => e,
    );
    expect((err as RestoreError).code).toBe("BACKUP_NOT_JSON");
  });
});

describe("exportBackup — honest outcome in Tauri (DR-026)", () => {
  // As the store action wires it (src/state/portfolioStore.ts).
  const exportWithAppDeps = (s: TestSql) =>
    exportBackup(s, { today: localIsoDay(), save: saveFile });

  beforeEach(() => vi.stubGlobal("window", { __TAURI_INTERNALS__: {} }));
  afterEach(() => vi.unstubAllGlobals());

  // UX-063 (DR-068): the suggested file name carries the local calendar day, so a
  // backup made just after midnight is not dated yesterday (UTC).
  it("names the file with the local date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 1, 0, 30)); // 00:30 local time
    try {
      await exportWithAppDeps(sql);
    } finally {
      vi.useRealTimers();
    }
    expect(suggestedName()).toBe("portfolio-backup-2026-10-01.json");
  });

  it("returns cancelled (and writes nothing) when the save dialog is cancelled", async () => {
    expect(await exportWithAppDeps(sql)).toEqual({ kind: "cancelled" });
    expect(files.size).toBe(0);
  });

  it("throws BackupExportError when the file cannot be written", async () => {
    rust.savePick = "/Users/me/backup.json";
    rust.writeError = "permission denied";
    const err = await exportWithAppDeps(sql).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackupExportError);
    expect((err as BackupExportError).detail).toBe("permission denied");
  });

  it("throws BackupExportError when the file does not read back as written", async () => {
    rust.savePick = "/Users/me/backup.json";
    rust.readBack = () => "{}";
    const err = await exportWithAppDeps(sql).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackupExportError);
    expect((err as BackupExportError).detail).toMatch(/does not match/);
  });

  it("returns saved with the chosen file name on success", async () => {
    rust.savePick = "/Users/me/my-backup.json";
    expect(await exportWithAppDeps(sql)).toEqual({
      kind: "saved",
      filename: "my-backup.json",
    });
    const json = files.get("/Users/me/my-backup.json")!;
    expect((JSON.parse(json) as BackupFile).tables.properties).toHaveLength(3);
  });
});
