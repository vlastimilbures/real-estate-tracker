// ADR 0270: Rust rejects a command with `{ code, detail }`, and the webview matches on
// the code. The user sees exactly what they saw when Rust rejected with the bare text, in
// every language: the Rust detail goes into the same translated sentence. Each case
// starts at the wire (a mocked `invoke`) and ends at the shown text.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openMemorySql } from "../../data/__tests__/betterSqlite";
import { migrate } from "../../data/migrations";
import { exportBackup, writeSafetyBackup } from "../../data/backup";
import { dbTransaction } from "../../platform/dbCommands";
import { saveFile } from "../../platform/saveFile";
import { chooseRestoreFile } from "../../state/backup";
import { toActionError } from "../../state/actionError";
import { toWriteError } from "../../state/writeError";
import { backupFailureText } from "../components/restoreFailure";
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

    it("a failed safety backup names Rust's detail", async () => {
      const t = dicts[lang];
      const sql = openMemorySql();
      await migrate(sql);
      const detail = "BACKUP_EXISTS: /app-config/backups/x.json";
      rustFails("BACKUP_EXISTS", detail);
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
