import { DatabaseBackup, X } from "lucide-react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { useUiStore } from "../../state/uiStore";
import { backupRecency } from "../model/backupRecency";
import { useT } from "../hooks/useT";

/** Quiet sidebar reminder (ADR 0110): data changed and no backup, or the last one is
 *  older than 30 days. Opens Settings → Backup; hidden for the session on dismiss. */
export function BackupHint({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const backup = usePortfolioStore((s) => s.backup);
  const dismissed = useUiStore((s) => s.backupHintDismissed);
  const dismiss = useUiStore((s) => s.dismissBackupHint);
  const openSettings = useUiStore((s) => s.openSettings);

  const { days, showHint } = backupRecency(backup, new Date());
  if (!showHint || dismissed) return null;
  const text =
    days === null ? t.shell.backupHintNone : t.shell.backupHintOld(days);
  const open = () => openSettings("backup");

  if (collapsed)
    return (
      <button
        type="button"
        className="icon-btn backup-hint-icon"
        title={text}
        aria-label={text}
        onClick={open}
      >
        <DatabaseBackup size={18} />
      </button>
    );

  return (
    <div className="backup-hint">
      <button type="button" className="backup-hint-link" onClick={open}>
        <DatabaseBackup size={14} aria-hidden="true" />
        <span>{text}</span>
      </button>
      <button
        type="button"
        className="icon-btn backup-hint-dismiss"
        title={t.shell.dismissBackupHint}
        aria-label={t.shell.dismissBackupHint}
        onClick={dismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}
