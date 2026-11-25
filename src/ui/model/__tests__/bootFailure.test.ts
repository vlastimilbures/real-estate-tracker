// #115 (ADR 0153): what the startup error screen offers for each failure.
import { describe, it, expect } from "vitest";
import { bootView, fileName, isPartial } from "../bootFailure";
import { READ_FAILURES } from "../../../data/errors";

describe("bootView", () => {
  it.each([
    ["DB_INTEGRITY", { retry: false, records: false, restore: false }],
    ["DB_NEWER", { retry: false, records: false, restore: false }],
    // ADR 0230: refused on every start. Restore stays off until the owner decides how it
    // treats the refused file (open point on #450).
    ["DB_TOO_OLD", { retry: false, records: false, restore: false }],
    ["MIGRATION_CONFLICT", { retry: false, records: true, restore: false }],
    [
      "MIGRATION_BACKUP_FAILED",
      { retry: true, records: false, restore: false },
    ],
    ["MIGRATION_FAILED", { retry: true, records: false, restore: false }],
    ["ROW_INVALID", { retry: false, records: true, restore: true }],
    ["ROW_MISSING", { retry: true, records: true, restore: false }],
    // ADR 0231: an unreadable scenario row is handled like ROW_INVALID.
    ["SCENARIO_INVALID", { retry: false, records: true, restore: true }],
    [null, { retry: true, records: false, restore: false }],
  ] as const)("%s", (code, view) => {
    expect(bootView(code, READ_FAILURES)).toEqual(view);
  });
});

describe("isPartial", () => {
  it("is true only when a step committed before the stop", () => {
    const base = { from: 6, stoppedAt: 8, backupPath: null };
    expect(isPartial({ ...base, reached: 7 })).toBe(true);
    expect(isPartial({ ...base, reached: 6 })).toBe(false);
    expect(isPartial(undefined)).toBe(false);
  });
});

describe("fileName", () => {
  it("keeps the last path part", () => {
    expect(
      fileName("/Users/x/Library/backups/pre-migration-v6-to-v10.sqlite"),
    ).toBe("pre-migration-v6-to-v10.sqlite");
    expect(fileName("plain.sqlite")).toBe("plain.sqlite");
  });
});
