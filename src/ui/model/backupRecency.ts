// Backup recency (ADR 0110): how old the last export is, and when the sidebar hint shows.
// Pure: "now" is passed in.
import type { BackupState } from "../../state/backup";
import { todayUtc } from "../../lib/today";

/** A backup older than this many days, with data changed since, shows the hint. */
export const BACKUP_STALE_DAYS = 30;

const DAY_MS = 86_400_000;

export type BackupAgo =
  | { unit: "today"; n: 0 }
  | { unit: "days"; n: number }
  | { unit: "weeks"; n: number };

export interface BackupRecency {
  /** The local calendar day of the last backup, as a UTC-midnight date (`fmtDate`). */
  day: Date | null;
  /** Whole local calendar days since it. */
  days: number | null;
  ago: BackupAgo | null;
  showHint: boolean;
}

function agoOf(days: number): BackupAgo {
  if (days <= 0) return { unit: "today", n: 0 };
  if (days < 14) return { unit: "days", n: days };
  return { unit: "weeks", n: Math.floor(days / 7) };
}

export function backupRecency(state: BackupState, now: Date): BackupRecency {
  const at = state.lastAt === null ? null : new Date(state.lastAt);
  if (at === null || Number.isNaN(at.getTime()))
    return { day: null, days: null, ago: null, showHint: state.changedSince };
  const day = todayUtc(at);
  const days = Math.round((todayUtc(now).getTime() - day.getTime()) / DAY_MS);
  return {
    day,
    days,
    ago: agoOf(days),
    showHint: state.changedSince && days > BACKUP_STALE_DAYS,
  };
}
