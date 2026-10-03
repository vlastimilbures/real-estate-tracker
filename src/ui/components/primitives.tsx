// Reusable presentation primitives. They format and render engine output — no maths.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X, FileSpreadsheet } from "lucide-react";
import type { Decimal } from "../../lib/money";
import {
  fmtCzk,
  fmtPct,
  fmtMultiple,
  fmtDscr,
  signTone,
  type Tone,
} from "../../lib/format";
import type { Band } from "../model/health";
import { irrReasonText, type LeveredIrr } from "../model/irr";
import { useT } from "../hooks/useT";
import type { SaveOutcome } from "../../state/platform";
import { logFailure, messageOf } from "../../state/diagnostics";

type Num = Decimal | number;

/** Money value with accounting conventions: red parentheses for negatives. Only a
 *  `signed` flow (net cash flow, NOI) is also green when positive (UX-026). */
export function Money({
  value,
  parens = true,
  suffix = true,
  signed = false,
}: {
  value: Num;
  parens?: boolean | undefined;
  suffix?: boolean | undefined;
  signed?: boolean | undefined;
}) {
  const sign: Tone = signTone(value);
  const t: Tone = signed || sign === "negative" ? sign : "neutral";
  return (
    <span className={`num tone-${t}`}>{fmtCzk(value, { parens, suffix })}</span>
  );
}

export function Pct({ value, dp = 1 }: { value: Num; dp?: number }) {
  return <span className="num">{fmtPct(value, dp)}</span>;
}

/** A levered IRR, or "n/a" with the reason it has none as a tooltip and for screen
 *  readers (UX-079, DR-158). */
export function IrrValue({ irr, dp = 1 }: { irr: LeveredIrr; dp?: number }) {
  const t = useT();
  if (irr.rate) return <Pct value={irr.rate} dp={dp} />;
  const note = irrReasonText(t, irr.reason);
  return (
    <span className="num" title={note}>
      {t.common.notApplicable}
      {note && <span className="sr-only"> ({note})</span>}
    </span>
  );
}

export function Mult({ value, dp = 2 }: { value: Num; dp?: number }) {
  return <span className="num">{fmtMultiple(value, dp)}</span>;
}

/** DSCR, capped for display at ">99,00x" (D-35). */
export function Dscr({ value }: { value: Num }) {
  return <span className="num">{fmtDscr(value)}</span>;
}

export function Badge({ band, children }: { band: Band; children: ReactNode }) {
  return <span className={`badge ${band}`}>{children}</span>;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string | undefined;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? "on" : ""}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  variant = "default",
  size,
  icon: Icon,
  type = "button",
  ...rest
}: {
  children: ReactNode;
  variant?: "default" | "primary" | "danger" | "ghost" | undefined;
  size?: "sm" | undefined;
  icon?: LucideIcon | undefined;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["btn", variant === "default" ? "" : variant, size ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    // type defaults to "button" so only an explicit type="submit" submits a form (UX-028).
    <button className={cls} type={type} {...rest}>
      {Icon && <Icon size={14} strokeWidth={1.75} />}
      {children}
    </button>
  );
}

/** Horizontally/vertically scrolling table container: a named region keyboard users can
 *  Tab to and scroll with the arrow keys (UX-024). */
export function TableWrap({
  label,
  style,
  children,
}: {
  label: string;
  style?: React.CSSProperties | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label={label}
      tabIndex={0}
      style={style}
    >
      {children}
    </div>
  );
}

export function Panel({
  title,
  hint,
  action,
  flush = false,
  children,
}: {
  title?: string | undefined;
  hint?: string | undefined;
  action?: ReactNode | undefined;
  flush?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {(title || action) && (
        <div className="panel-head">
          <div className="panel-head-titles">
            {/* Focusable from script only: an in-page link lands here (ADR 0107). */}
            {title && <h3 tabIndex={-1}>{title}</h3>}
            {hint && <span className="hint">{hint}</span>}
          </div>
          {action}
        </div>
      )}
      <div className={`panel-body${flush ? " flush" : ""}`}>{children}</div>
    </section>
  );
}

/**
 * Icon button for a Panel `action` slot that exports the panel's table to .xlsx.
 * Self-contained feedback: disables while writing, then surfaces a confirmation toast
 * naming the saved file, nothing for a cancelled dialog (the user's own choice), or an
 * error toast with the reason (DR-112).
 */
export function ExportXlsxButton({
  onExport,
  label,
}: {
  /** Resolves to what happened to the file (see saveFile). */
  onExport: () => Promise<SaveOutcome>;
  label?: string | undefined;
}) {
  const t = useT();
  const btnLabel = label ?? t.xlsx.exportToExcel;
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Don't leak the dismiss timer (or setState after unmount).
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (message: string) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2500);
  };

  const run = async () => {
    setBusy(true);
    try {
      const outcome = await onExport();
      if (outcome.kind !== "cancelled")
        flash(t.xlsx.exported(outcome.filename));
    } catch (e) {
      logFailure("EXPORT", e);
      flash(t.xlsx.exportFailed(messageOf(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
        aria-label={btnLabel}
        title={btnLabel}
      >
        <FileSpreadsheet size={16} strokeWidth={1.75} />
      </button>
      {toast && <Toast message={toast} />}
    </>
  );
}

export function KpiTile({
  label,
  value,
  foot,
  hero = false,
  badge,
  delay = 0,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode | undefined;
  hero?: boolean | undefined;
  badge?: { band: Band; text: string };
  delay?: number | undefined;
  testId?: string | undefined;
}) {
  return (
    <div
      className={`tile reveal${hero ? " hero" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="spread">
        <span className="label">{label}</span>
        {badge && <Badge band={badge.band}>{badge.text}</Badge>}
      </div>
      <div className={`value ${hero ? "xl" : "lg"}`} data-testid={testId}>
        {value}
      </div>
      {hero && <div className="accent-rule" />}
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function StatList({ rows }: { rows: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <div className="statlist">
      {rows.map((r, i) => (
        <Fragmentish key={i} k={r.k} v={r.v} />
      ))}
    </div>
  );
}
function Fragmentish({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon: Icon,
}: {
  title: string;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
  icon?: LucideIcon | undefined;
}) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon size={20} strokeWidth={1.75} />
        </div>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

/** Inline, dismissible error banner for a failed action (e.g. a DB write). */
export function ErrorBanner({
  message,
  onDismiss,
  action,
}: {
  message: string;
  onDismiss?: (() => void) | undefined;
  /** Optional inline button, e.g. Reload. */
  action?: { label: string; onClick: () => void };
}) {
  const t = useT();
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      {action && (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="icon-btn"
          onClick={onDismiss}
          aria-label={t.common.dismiss}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
