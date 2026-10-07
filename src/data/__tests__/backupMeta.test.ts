// ADR 0110: the last export and the "changed since" flag live in `app_meta`, outside the
// backup, so a restore can never bring back a stale `last_backup_at`.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import {
  LAST_BACKUP_AT,
  loadState,
  markDataChanged,
  recordBackup,
} from "../repositories";
import { exportToJson, restoreFromJson, type BackupFile } from "../backup";
import { checkInputRules } from "../../import/inputRules";

let sql: TestSql;

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});

afterEach(() => sql.db.close());

const backupOf = async () => (await loadState(sql)).backup;

describe("backup recency in app_meta (ADR 0110)", () => {
  it("a fresh install has no backup and no change", async () => {
    expect(await backupOf()).toEqual({
      lastAt: null,
      lastFile: null,
      changedSince: false,
    });
  });

  it("a data write sets the changed flag, idempotently", async () => {
    await markDataChanged(sql);
    await markDataChanged(sql);
    expect((await backupOf()).changedSince).toBe(true);
  });

  it("recording an export stores the time and file and clears the flag", async () => {
    await markDataChanged(sql);
    await recordBackup(
      sql,
      "2026-09-12T08:30:00.000Z",
      "portfolio-backup-2026-09-12.json",
    );
    expect(await backupOf()).toEqual({
      lastAt: "2026-09-12T08:30:00.000Z",
      lastFile: "portfolio-backup-2026-09-12.json",
      changedSince: false,
    });
  });

  it("can keep the changed flag for a write newer than the exported file", async () => {
    await markDataChanged(sql);
    await recordBackup(sql, "2026-09-12T08:30:00.000Z", "a.json", false);
    expect(await backupOf()).toMatchObject({
      lastAt: "2026-09-12T08:30:00.000Z",
      changedSince: true,
    });
  });

  it("a later export overwrites the earlier one", async () => {
    await recordBackup(sql, "2026-09-12T08:30:00.000Z", "a.json");
    await recordBackup(sql, "2026-10-01T10:00:00.000Z", "b.json");
    expect(await backupOf()).toMatchObject({
      lastAt: "2026-10-01T10:00:00.000Z",
      lastFile: "b.json",
    });
    const rows = sql.db
      .prepare("SELECT COUNT(*) AS n FROM app_meta WHERE key = ?")
      .get(LAST_BACKUP_AT) as { n: number };
    expect(rows.n).toBe(1);
  });

  it("a backup file does not carry the recency keys", async () => {
    await recordBackup(sql, "2026-09-12T08:30:00.000Z", "a.json");
    const backup = await exportToJson(sql, new Date());
    expect(Object.keys(backup.tables)).not.toContain("app_meta");
  });

  it("a restore keeps the local last backup, even from a file with a forged app_meta", async () => {
    const old = await exportToJson(sql, new Date());
    await recordBackup(sql, "2026-10-01T10:00:00.000Z", "local.json");
    const forged: BackupFile = {
      ...old,
      tables: {
        ...old.tables,
        app_meta: [{ key: LAST_BACKUP_AT, value: "2099-01-01T00:00:00.000Z" }],
      },
    };
    await restoreFromJson(sql, forged, checkInputRules);
    expect(await backupOf()).toMatchObject({
      lastAt: "2026-10-01T10:00:00.000Z",
      lastFile: "local.json",
    });
  });
});
