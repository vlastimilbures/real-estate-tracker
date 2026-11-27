// ADR 0270: Rust rejects a command with `{ code, detail }`, and the webview matches on
// the code. The user sees exactly what they saw when Rust rejected with the bare text, in
// every language: the Rust detail goes into the same translated sentence. Each case
// starts at the wire (a mocked `invoke`) and ends at the shown text.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { schemaAt } from "../../data/__tests__/support/schemaAt";
import { migrate, MIGRATIONS, stamp } from "../../data/migrations";
import { exportBackup, writeSafetyBackup } from "../../data/backup";
import { clearSample } from "../../data/seed";
import { dbBackup, dbTransaction } from "../../platform/dbCommands";
import { saveFile } from "../../platform/saveFile";
import { chooseRestoreFile } from "../../state/backup";
import { toActionError } from "../../state/actionError";
import { toStartupError } from "../../state/portfolio/startupError";
import { toWriteError } from "../../state/writeError";
import { backupFailureText } from "../components/restoreFailure";
import { startupDetails } from "../model/bootFailure";
import { describeWriteError } from "../model/writeError";
import { loadDictionary, type Dictionary, type Language } from "../../i18n";

vi.mock("../../lib/tauri", () => ({ isTauri: () => true }));

/** Rust's rejection for the next command call. */
function rustFails(code: string, detail: string, constraint?: object): void {
  vi.mocked(invoke).mockRejectedValueOnce({ code, detail, constraint });
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => expect.fail("expected a failure"),
    (e: unknown) => e,
  );
}

function shown(t: Dictionary, e: unknown): string {
  return backupFailureText(t, toActionError(e), {
    other: (detail) => `other: ${detail}`,
  }).text;
}

const dicts = {} as Record<Language, Dictionary>;
beforeAll(async () => {
  for (const lang of ["en", "cs", "ru"] as const)
    dicts[lang] = await loadDictionary(lang);
});

describe.each(["en", "cs", "ru"] as const)(
  "a failed Rust command in %s shows the same text as before (ADR 0270)",
  (lang) => {
    it("an unreadable backup file names Rust's detail", async () => {
      const t = dicts[lang];
      const detail = "Operation not permitted (os error 1)";
      rustFails("IO", detail);
      const e = await caught(chooseRestoreFile());
      expect(shown(t, e)).toBe(t.backup.errUnreadable(detail));
    });

    it("a backup file over the limit is refused with the limit", async () => {
      const t = dicts[lang];
      rustFails("BACKUP_TOO_LARGE", "BACKUP_TOO_LARGE");
      const e = await caught(chooseRestoreFile());
      expect(shown(t, e)).toBe(t.backup.errTooLarge(20));
    });

    it("a safety backup the disk refused names the OS text", async () => {
      // ADR 0271: IO has no text of its own, so its detail is shown as before.
      const t = dicts[lang];
      const sql = openMemorySql();
      await migrate(sql);
      const detail = "No space left on device (os error 28)";
      rustFails("IO", detail);
      const e = await caught(writeSafetyBackup(sql));
      expect(shown(t, e)).toBe(t.backup.safetyBackupFailed(detail));
      sql.db.close();
    });

    it("a failed backup export names the OS text", async () => {
      const t = dicts[lang];
      const sql = openMemorySql();
      await migrate(sql);
      const detail = "No space left on device (os error 28)";
      rustFails("IO", detail);
      const e = await caught(
        exportBackup(sql, {
          now: new Date(0),
          today: "2026-10-01",
          save: saveFile,
        }),
      );
      expect(shown(t, e)).toBe(t.backup.exportFailed(detail));
      sql.db.close();
    });

    it("a duplicate name in a transaction is still a duplicate name", async () => {
      const t = dicts[lang];
      rustFails(
        "SQL",
        "error returned from database: (code: 2067) UNIQUE constraint failed: properties.name",
        { kind: "unique", table: "properties", columns: ["name"] },
      );
      const e = await caught(dbTransaction([{ query: "INSERT …" }]));
      expect(describeWriteError(t, toWriteError(e))).toEqual({
        message: t.writeErrors.duplicatePropertyName,
        field: "name",
      });
    });

    it("any other failed write shows Rust's detail", async () => {
      const t = dicts[lang];
      rustFails("SQL", "database is locked");
      const e = await caught(dbTransaction([{ query: "INSERT …" }]));
      expect(toActionError(e)).toEqual({
        kind: "other",
        message: "database is locked",
      });
      expect(shown(t, e)).toBe(
        `other: ${describeWriteError(t, { kind: "other", message: "database is locked" }).message}`,
      );
    });
  },
);

const NOW = new Date(Date.UTC(2026, 10, 27, 9, 30, 0));
const HEAD = Math.max(...MIGRATIONS.map((m) => m.version));
/** The three fixed file-write codes and Rust's text for each (src-tauri/src/error.rs). */
const FILE_WRITE = [
  ["SAVED_FILE_MISMATCH", "the saved file does not match"],
  ["NO_FOLDER", "no folder for /Users/me/x"],
  ["NO_FILE_NAME", "no file name in /Users/me/.."],
] as const;

describe.each(["en", "cs", "ru"] as const)(
  "a backup or save failure in %s is shown by its code (ADR 0271)",
  (lang) => {
    it("a safety backup that already exists names the file in the user's language", async () => {
      const t = dicts[lang];
      const sql = openMemorySql();
      await migrate(sql);
      rustFails(
        "BACKUP_EXISTS",
        "BACKUP_EXISTS: /Users/me/backups/portfolio-before-restore-x.json",
      );
      const e = await caught(writeSafetyBackup(sql, NOW));
      const name = `portfolio-before-restore-${stamp(NOW)}.json`;
      const text = shown(t, e);
      expect(text).toBe(
        t.backup.safetyBackupFailed(t.commandErrors.BACKUP_EXISTS(name)),
      );
      expect(text).not.toContain("BACKUP_");
      expect(text).not.toContain("/");
      sql.db.close();
    });

    it("the same for the safety backup of Clear sample", async () => {
      const t = dicts[lang];
      const sql = openMemorySql();
      await migrate(sql);
      rustFails("BACKUP_EXISTS", "BACKUP_EXISTS: /Users/me/backups/x.json");
      const e = await caught(clearSample(sql, NOW));
      const name = `portfolio-before-clear-sample-${stamp(NOW)}.json`;
      const text = backupFailureText(t, toActionError(e), {
        safety: t.sample.safetyBackupFailed,
        other: t.sample.clearFailed,
      }).text;
      expect(text).toBe(
        t.sample.safetyBackupFailed(t.commandErrors.BACKUP_EXISTS(name)),
      );
      expect(text).not.toContain("/");
      sql.db.close();
    });

    it.each(FILE_WRITE)(
      "a safety backup that failed with %s shows its text",
      async (code, detail) => {
        const t = dicts[lang];
        const sql = openMemorySql();
        await migrate(sql);
        rustFails(code, detail);
        const e = await caught(writeSafetyBackup(sql, NOW));
        expect(shown(t, e)).toBe(
          t.backup.safetyBackupFailed(t.commandErrors[code]),
        );
        sql.db.close();
      },
    );

    it.each(FILE_WRITE)(
      "a backup export that failed with %s shows its text, with no path",
      async (code, detail) => {
        const t = dicts[lang];
        const sql = openMemorySql();
        await migrate(sql);
        rustFails(code, detail);
        const e = await caught(
          exportBackup(sql, { now: NOW, today: "2026-11-27", save: saveFile }),
        );
        const text = shown(t, e);
        expect(text).toBe(t.backup.exportFailed(t.commandErrors[code]));
        expect(text).not.toContain("/");
        sql.db.close();
      },
    );

    it.each([
      [
        "BACKUP_FAILED",
        "BACKUP_FAILED: database or disk is full",
        (t: Dictionary) => t.commandErrors.BACKUP_FAILED,
      ],
      [
        "BACKUP_EXISTS",
        "BACKUP_EXISTS: /Users/me/backups/pre-migration-x.sqlite",
        (t: Dictionary) =>
          t.commandErrors.BACKUP_EXISTS(
            `pre-migration-v8-to-v${HEAD}-${stamp(NOW)}.sqlite`,
          ),
      ],
    ] as const)(
      "a stopped upgrade whose copy failed with %s shows its text",
      async (code, detail, expected) => {
        const t = dicts[lang];
        const sql = await schemaAt(8);
        sql.backup = dbBackup;
        rustFails(code, detail);
        const e = await caught(migrate(sql, { now: () => NOW }));
        const startup = toStartupError(e);
        expect(startup?.code).toBe("MIGRATION_BACKUP_FAILED");
        expect(startupDetails(t, startup!)).toEqual([
          { text: expected(t), code: false },
        ]);
        sql.db.close();
      },
    );

    it("a stopped upgrade whose copy failed with SQL keeps Rust's line", async () => {
      const t = dicts[lang];
      const sql = await schemaAt(8);
      sql.backup = dbBackup;
      rustFails("SQL", "database is locked");
      const e = await caught(migrate(sql, { now: () => NOW }));
      expect(startupDetails(t, toStartupError(e)!)).toEqual([
        { text: "database is locked", code: true },
      ]);
      sql.db.close();
    });
  },
);
