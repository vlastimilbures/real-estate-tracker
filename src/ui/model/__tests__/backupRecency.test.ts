// ADR 0110: how old the last backup is, and when the sidebar hint shows, for an
// injected "now".
import { describe, expect, it } from "vitest";
import { BACKUP_STALE_DAYS, backupRecency } from "../backupRecency";

const now = new Date(2026, 9, 3, 12, 0); // 03.10.2026 12:00 local
const state = (lastAt: string | null, changedSince: boolean) => ({
  lastAt,
  lastFile: null,
  changedSince,
});
const daysBefore = (n: number) => new Date(2026, 9, 3 - n, 9, 0).toISOString();

describe("backupRecency (ADR 0110)", () => {
  it("the stale threshold is 30 days", () => {
    expect(BACKUP_STALE_DAYS).toBe(30);
  });

  it("no backup and no change: no hint (a fresh sample install)", () => {
    expect(backupRecency(state(null, false), now)).toEqual({
      day: null,
      days: null,
      ago: null,
      showHint: false,
    });
  });

  it("no backup and changed data: hint", () => {
    expect(backupRecency(state(null, true), now).showHint).toBe(true);
  });

  it("dates the backup by the local calendar day", () => {
    const r = backupRecency(state(daysBefore(21), false), now);
    expect(r.day).toEqual(new Date(Date.UTC(2026, 8, 12)));
    expect(r.ago).toEqual({ unit: "weeks", n: 3 });
  });

  // Near local midnight the UTC day differs: a backup at 00:30 is the previous UTC day
  // under a positive offset, one at 23:30 the next UTC day under a negative one (#119).
  it("near local midnight, still the local calendar day", () => {
    const at = (h: number, m: number) =>
      new Date(2026, 9, 2, h, m).toISOString();
    const early = backupRecency(state(at(0, 30), false), now);
    expect(early.day).toEqual(new Date(Date.UTC(2026, 9, 2)));
    expect(early.days).toBe(1);
    const late = backupRecency(state(at(23, 30), false), now);
    expect(late.day).toEqual(new Date(Date.UTC(2026, 9, 2)));
    expect(late.days).toBe(1);
  });

  it("today, days, then whole weeks from 14 days", () => {
    const ago = (n: number) =>
      backupRecency(state(daysBefore(n), false), now).ago;
    expect(ago(0)).toEqual({ unit: "today", n: 0 });
    expect(ago(1)).toEqual({ unit: "days", n: 1 });
    expect(ago(13)).toEqual({ unit: "days", n: 13 });
    expect(ago(14)).toEqual({ unit: "weeks", n: 2 });
    expect(ago(45)).toEqual({ unit: "weeks", n: 6 });
  });

  it("30 days old and changed: no hint yet; 31 days: hint", () => {
    expect(backupRecency(state(daysBefore(30), true), now).showHint).toBe(
      false,
    );
    const r = backupRecency(state(daysBefore(31), true), now);
    expect(r.showHint).toBe(true);
    expect(r.days).toBe(31);
  });

  it("an old backup with no change since: no hint", () => {
    expect(backupRecency(state(daysBefore(90), false), now).showHint).toBe(
      false,
    );
  });

  it("an unreadable stored date counts as no backup", () => {
    expect(backupRecency(state("not a date", true), now)).toEqual({
      day: null,
      days: null,
      ago: null,
      showHint: true,
    });
  });
});
