// Where the app reports what an action did (ADR 0154), on whichever page the owner is
// on: the safety copy a restore or Clear sample wrote and the last failure, each until
// dismissed, and the toast, whose live region is in the page before its text arrives.
import { useEffect, useRef } from "react";
import {
  useUiStore,
  type Failure,
  type Notice,
  type OutcomeAction,
} from "../../state/uiStore";
import type { ActionError } from "../../state/actionError";
import type { Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { useFirstShow } from "../hooks/useFirstShow";
import { Button } from "./Button";
import { ErrorBanner } from "./layout";
import { IssueTable } from "./RestoreConfirm";
import { backupFailureText } from "./restoreFailure";

/** A failed action as text, translated now (the failure was logged when caught). */
function failureText(
  t: Dictionary,
  action: OutcomeAction,
  e: ActionError,
): string {
  switch (action) {
    case "restore":
      return backupFailureText(t, e, { other: t.backup.restoreFailed }).text;
    case "pickBackup":
      return backupFailureText(t, e, { other: t.backup.errInvalid }).text;
    case "backupExport":
      return backupFailureText(t, e, { other: t.backup.exportFailed }).text;
    case "loadSample":
      return backupFailureText(t, e, { other: t.sample.loadFailed }).text;
    case "import":
      return backupFailureText(t, e, { other: t.importPage.importFailed }).text;
    case "xlsxExport":
      return t.xlsx.exportFailed(saveDetail(e));
    case "revealFolder":
      return t.boot.revealFailed;
  }
}

/** A failed export's text (ADR 0193): the export button stores it as `saveFailed`; an
 *  untyped failure set elsewhere gives its message. */
function saveDetail(e: ActionError): string {
  if (e.kind === "saveFailed") return e.detail;
  return e.kind === "other" ? e.message : "";
}

function FailureView({ failure }: { failure: Failure }) {
  const t = useT();
  const dismiss = useUiStore((s) => s.dismissFailure);
  const { action, error } = failure;
  const live = useFirstShow(failure);
  const box = useRef<HTMLDivElement>(null);
  // An owner scrolled down (e.g. to the Import button) sees it too (ADR 0189).
  useEffect(() => {
    if (live) box.current?.scrollIntoView?.({ block: "nearest" });
  }, [live, failure]);
  return (
    <div className="outcome-failure" ref={box}>
      <ErrorBanner
        message={failureText(t, action, error)}
        onDismiss={dismiss}
        live={live}
      />
      {error.kind === "restoreRefused" && error.issues.length > 0 && (
        <IssueTable issues={error.issues} />
      )}
    </div>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  const t = useT();
  const dismiss = useUiStore((s) => s.dismissNotice);
  const live = useFirstShow(notice);
  return (
    <div className="banner info" role={live ? "status" : undefined}>
      <span>
        {notice.kind === "restored"
          ? t.backup.restored(notice.file)
          : t.sample.cleared(notice.file)}
      </span>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        {t.common.dismiss}
      </Button>
    </div>
  );
}

/** The notice and the failure (if any), for the app shell. */
export function OutcomeRegions() {
  const notice = useUiStore((s) => s.notice);
  const failure = useUiStore((s) => s.failure);
  return (
    <>
      {failure && <FailureView failure={failure} />}
      {notice && <NoticeView notice={notice} />}
    </>
  );
}

/** The toast's live region, mounted once beside the page so it outlives a page change
 *  (ADR 0189). */
export function ToastRegion() {
  const toast = useUiStore((s) => s.toast);
  return (
    <div
      className="toast-region"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {toast && (
        <div className="toast" key={toast.id}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
