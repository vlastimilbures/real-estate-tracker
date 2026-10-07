// The startup error screen (UX-057, DR-086; #115, ADR 0153). Says what happened, honestly
// (a stopped upgrade may have changed the database), and offers only what can help:
// Try again for a failure that may not repeat, and the data folder for every one.
import { useState } from "react";
import {
  usePortfolioStore,
  type StartupError,
} from "../../state/portfolioStore";
import { revealDataDir } from "../../state/platform";
import { logFailure } from "../../state/diagnostics";
import type { Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { Button } from "./primitives";
import { describeWriteError } from "../model/writeError";
import { bootView, fileName, isPartial } from "../model/bootFailure";

/** The message, then what the upgrade left behind or the next step, if any. */
function startupText(t: Dictionary, e: StartupError): string[] {
  const u = e.upgrade;
  if (u && isPartial(u)) {
    const stopped =
      e.code === "MIGRATION_CONFLICT"
        ? t.boot.partialConflict(u.reached, u.stoppedAt)
        : t.boot.partialFailed(u.reached, u.stoppedAt);
    const copy = u.backupPath
      ? t.boot.copyAt(fileName(u.backupPath))
      : t.boot.copyMissing;
    return [stopped, copy];
  }
  const next =
    e.code === "DB_INTEGRITY"
      ? t.boot.nextIntegrity
      : e.code === "ROW_INVALID"
        ? t.boot.nextRowInvalid
        : null;
  return next ? [t.dataErrors[e.code], next] : [t.dataErrors[e.code]];
}

export function BootFailure() {
  const t = useT();
  const startupError = usePortfolioStore((s) => s.startupError);
  const error = usePortfolioStore((s) => s.error);
  const init = usePortfolioStore((s) => s.init);
  const [revealFailed, setRevealFailed] = useState(false);
  const view = bootView(startupError?.code ?? null);

  async function showFolder() {
    setRevealFailed(false);
    try {
      await revealDataDir();
    } catch (e) {
      logFailure("REVEAL", e);
      setRevealFailed(true);
    }
  }

  return (
    <div className="error-screen" role="alert">
      <span className="eyebrow">{t.app.dbErrorEyebrow}</span>
      {startupError ? (
        <>
          {startupText(t, startupError).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {startupError.details.length > 0 && (
            <div className="error-screen-details">
              <span>
                {view.records
                  ? t.dataErrors.detailsHeading
                  : t.boot.detailsOther}
              </span>
              <ul>
                {startupError.details.map((d) => (
                  <li key={d}>
                    <code>{d}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        error && <code>{describeWriteError(t, error).message}</code>
      )}
      {view.retry && <p>{t.app.bootRetryHint}</p>}
      <small>{t.dataErrors.logHint}</small>
      {revealFailed && <p className="error-text">{t.boot.revealFailed}</p>}
      <div className="row" style={{ gap: "var(--s3)" }}>
        {view.retry && (
          <Button variant="primary" onClick={() => void init()}>
            {t.app.tryAgain}
          </Button>
        )}
        <Button onClick={() => void showFolder()}>
          {t.boot.showDataFolder}
        </Button>
      </div>
    </div>
  );
}
