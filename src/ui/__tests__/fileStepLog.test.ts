// The local log line (ADR 0147) for each failed file step of Backup & Restore: the
// backup export, the restore-file read and the safety backup. Each case starts at the
// wire (a mocked `invoke`) and ends at the `log_error` call the UI's logger makes, so the
// line is pinned byte for byte whatever class the data layer throws (#677).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { exportBackup, writeSafetyBackup } from "../../data/backup";
import { saveFile } from "../../platform/saveFile";
import { chooseRestoreFile } from "../../state/backup";
import type { FailureSite } from "../../state/diagnostics";
import { logBackupFailure } from "../components/restoreFailure";

vi.mock("../../lib/tauri", () => ({ isTauri: () => true }));

beforeEach(() => {
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
});

/** Rust's rejection for the next command call. */
function rustFails(code: string, detail: string): void {
  vi.mocked(invoke).mockRejectedValueOnce({ code, detail });
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => expect.fail("expected a failure"),
    (e: unknown) => e,
  );
}

/** The line the logger sends for `e` under `site`. */
function logged(site: FailureSite, e: unknown): unknown {
  vi.mocked(invoke).mockClear();
  logBackupFailure(site, e);
  const calls = vi.mocked(invoke).mock.calls.filter(([c]) => c === "log_error");
  expect(calls).toHaveLength(1);
  return calls[0]![1];
}

describe("a failed file step logs the same line (ADR 0147, #677)", () => {
  it("the backup export", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    rustFails("IO", "No space left on device (os error 28) at 2026-10-01");
    const e = await caught(
      exportBackup(sql, {
        now: new Date(0),
        today: "2026-10-01",
        save: saveFile,
      }),
    );
    expect(logged("BACKUP", e)).toEqual({
      code: "BACKUP_FAILED",
      context:
        "IO: Could not save the backup: No space left on device (os error 28) at #-#-#",
    });
    sql.db.close();
  });

  it("the restore-file read", async () => {
    rustFails("IO", "Operation not permitted (os error 1) in /Volumes/Disk 2");
    const e = await caught(chooseRestoreFile());
    expect(logged("RESTORE", e)).toEqual({
      code: "RESTORE_FAILED",
      context:
        "IO: Could not read the backup file: Operation not permitted (os error 1) in /Volumes/Disk #",
    });
  });

  it("the safety backup, before a restore or a sample clear", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    const detail =
      "BACKUP_EXISTS: /app-config/backups/portfolio-before-restore-20261001T120000Z.json";
    for (const site of ["RESTORE", "SAMPLE"] as const) {
      rustFails("BACKUP_EXISTS", detail);
      const e = await caught(writeSafetyBackup(sql));
      expect(logged(site, e)).toEqual({
        code: `${site}_FAILED`,
        context:
          "BACKUP_EXISTS: Could not save the safety backup: BACKUP_EXISTS: /app-config/backups/portfolio-before-restore-#T#Z.json",
      });
    }
    sql.db.close();
  });

  it("the safety backup when reading the current data fails", async () => {
    const sql = openMemorySql();
    await migrate(sql);
    const failing = {
      ...sql,
      selectSnapshot: () => Promise.reject(new Error("disk I/O error 522")),
    };
    const e = await caught(writeSafetyBackup(failing));
    expect(logged("SAMPLE", e)).toEqual({
      code: "SAMPLE_FAILED",
      context: "Could not save the safety backup: disk I/O error #",
    });
    sql.db.close();
  });
});
