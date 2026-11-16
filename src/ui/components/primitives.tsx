// Reusable presentation primitives. They format and render engine output — no maths.
import { useId, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X, FileSpreadsheet } from "lucide-react";
import type { Decimal } from "../../lib/money";
import {
  fmtCzk,
  fmtCzkM,
  fmtPct,
  fmtDscr,
  roundCzk,
  signTone,
  type Tone,
} from "../../lib/format";
import { BAND_SHAPE, type Band } from "../model/health";
import { irrReasonText, type LeveredIrr } from "../model/irr";
import { useT } from "../hooks/useT";
import { InfoTip } from "./InfoTip";
import { useToast } from "../hooks/useToast";
import { useUiStore } from "../../state/uiStore";
import type { SaveOutcome } from "../../state/platform";
import { logFailure } from "../../state/diagnostics";

type Num = Decimal | number;

/** Money value with accounting conventions: red parentheses for negatives. Only a
 *  `signed` flow (net cash flow, NOI) is also green when positive (UX-026). The tone
 *  follows the value as printed, so "0 Kč" is never coloured (ADR 0178). */
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
  const sign: Tone = signTone(roundCzk(value));
  const t: Tone = signed || sign === "negative" ? sign : "neutral";
  return (
    <span className={`num tone-${t}`}>{fmtCzk(value, { parens, suffix })}</span>
  );
}

/** A percentage; null (a ratio with no base, e.g. LTV on no value) reads "n/a"
 *  (ADR 0133). */
export function Pct({ value, dp = 1 }: { value: Num | null; dp?: number }) {
  const t = useT();
  return (
    <span className="num">
      {value === null ? t.common.notApplicable : fmtPct(value, dp)}
    </span>
  );
}

/** An amount in M Kč (a tile's headline), red when negative (CLAUDE.md §5). The exact
 *  amount is its tooltip and is read out after it, as IrrValue's reason (ADR 0200). */
export function MoneyM({ value }: { value: Num }) {
  const exact = fmtCzk(value);
  const tone =
    signTone(roundCzk(value)) === "negative" ? "negative" : "neutral";
  return (
    <span className={`num tone-${tone}`} title={exact}>
      {fmtCzkM(value)}
      <span className="sr-only"> ({exact})</span>
    </span>
  );
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

/** DSCR, capped for display at ">99,00x" (D-35). */
export function Dscr({ value }: { value: Num }) {
  return <span className="num">{fmtDscr(value)}</span>;
}

/** A pill for a state that is not a band beside a figure (Pending, Inactive, import
 *  status); a band uses HealthMarker (ADR 0195). */
export function Badge({ band, children }: { band: Band; children: ReactNode }) {
  return <span className={`badge ${band}`}>{children}</span>;
}

const MARKER_SHAPES = {
  circle: <circle cx="5" cy="5" r="5" />,
  triangle: <polygon points="5,0 10,9.5 0,9.5" />,
  diamond: <polygon points="5,0 10,5 5,10 0,5" />,
  ring: (
    <circle
      cx="5"
      cy="5"
      r="4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  ),
} as const;

/**
 * A health band as a shape in its colour, after the figure (ADR 0195). The shape is
 * hidden from assistive technology; the band word carries the meaning: visible with
 * `showWord` (a tile's foot), otherwise screen-reader text plus a hover tooltip (a table).
 */
export function HealthMarker({
  band,
  word,
  showWord = false,
}: {
  band: Band;
  word: string;
  showWord?: boolean | undefined;
}) {
  const shape = BAND_SHAPE[band];
  return (
    <span
      className={`health-marker ${band}`}
      title={showWord ? undefined : word}
    >
      <svg
        viewBox="0 0 10 10"
        width="10"
        height="10"
        aria-hidden="true"
        focusable="false"
        data-shape={shape}
      >
        {MARKER_SHAPES[shape]}
      </svg>
      {showWord ? (
        <span className="health-word">{word}</span>
      ) : (
        <span className="sr-only"> {word}</span>
      )}
    </span>
  );
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

/**
 * Button roles (ADR 0201): one rule per role, so the same action looks the same
 * everywhere.
 *
 * - The page's one main action (top bar): primary, with an icon; "Add …" for creating.
 * - Add in a panel head or a row list: default, size "sm", Plus icon, "Add …" in full.
 * - Submit in a form or modal: primary, right-most.
 * - Cancel / Discard in a form or modal: ghost, left of submit.
 * - Other page or panel actions: default.
 * - Destructive confirm: ConfirmRow (ADR 0143), or a modal's default Cancel beside its
 *   danger button.
 *
 * At most one primary is visible per region: the top bar, an open form, a modal. Row
 * actions are `RowAction` (ADR 0199).
 */
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
  help,
  badges,
  info,
  action,
  flush = false,
  children,
}: {
  title?: string | undefined;
  /** Context on the title's line: a unit, lens, count or date (ADR 0214). */
  hint?: string | undefined;
  /** An explanation leading the body: a `HelpText` (ADR 0214). */
  help?: ReactNode | undefined;
  /** Status pills on their own line under the head, shown while the body is hidden too
   *  (the Data check's counts, ADR 0223). */
  badges?: ReactNode | undefined;
  /** A definition behind an info icon after the title and hint (ADR 0217). */
  info?: string | undefined;
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
            {title && <h2 tabIndex={-1}>{title}</h2>}
            {hint && <span className="hint">{hint}</span>}
            {info && title && <InfoTip topic={title}>{info}</InfoTip>}
          </div>
          {action}
        </div>
      )}
      {badges && <div className="panel-badges">{badges}</div>}
      <div className={`panel-body${flush ? " flush" : ""}`}>
        {help && <div className="panel-help">{help}</div>}
        {children}
      </div>
    </section>
  );
}

/**
 * Icon button for a Panel `action` slot that exports the panel's table to .xlsx.
 * Disables while writing, then shows a toast naming the saved file, nothing for a
 * cancelled dialog (the user's own choice), or a notice with the reason, which stays
 * until dismissed (DR-112, ADR 0154).
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
  const { showToast } = useToast();
  const setFailure = useUiStore((s) => s.setFailure);

  const run = async () => {
    setBusy(true);
    try {
      const outcome = await onExport();
      if (outcome.kind !== "cancelled")
        showToast(t.xlsx.exported(outcome.filename));
    } catch (e) {
      logFailure("EXPORT", e);
      setFailure("xlsxExport", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Visible text, which is also the accessible name (ADR 0111). */}
      <Button
        size="sm"
        icon={FileSpreadsheet}
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
      >
        {btnLabel}
      </Button>
    </>
  );
}

/** The KPI band (ADR 0222): one surface holding captioned groups of compact tiles. */
export function KpiBand({ children }: { children: ReactNode }) {
  return (
    <div className="kpi-strip-wrap">
      <div className="kpi-band">{children}</div>
    </div>
  );
}

/** A group of the KPI band, named by its caption: what its figures are for. */
export function KpiBandGroup({
  caption,
  cells,
  children,
}: {
  caption: string;
  /** How many tiles it holds, for its grid (ADR 0222 §3). */
  cells: 2 | 4 | 6;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      className={`kpi-band-group cells-${cells}`}
      role="group"
      aria-labelledby={id}
    >
      <p id={id} className="kpi-band-caption">
        {caption}
      </p>
      <div className="kpi-band-cells">{children}</div>
    </div>
  );
}

export function KpiTile({
  label,
  value,
  foot,
  compact = false,
  health,
  delay = 0,
  testId,
  valueTitle,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode | undefined;
  /** The Dashboard KPI strip's tile: smaller padding and value (ADR 0200). */
  compact?: boolean | undefined;
  /** The band, shown as a marker and its word at the start of the foot (ADR 0195). */
  health?: { band: Band; text: string } | undefined;
  delay?: number | undefined;
  testId?: string | undefined;
  /** The exact value where the tile rounds: the value's tooltip, and read out after it,
   *  as MoneyM does (ADR 0208 §1). */
  valueTitle?: string | undefined;
}) {
  return (
    <div
      className={`tile reveal${compact ? " compact" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="label">{label}</span>
      <div
        className={`value ${compact ? "md" : "lg"}`}
        data-testid={testId}
        title={valueTitle}
      >
        {value}
        {valueTitle && <span className="sr-only"> ({valueTitle})</span>}
      </div>
      {(foot || health) && (
        <div className="foot">
          {health && (
            <>
              <HealthMarker band={health.band} word={health.text} showWord />
              {foot && " · "}
            </>
          )}
          {foot}
        </div>
      )}
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
  level = 2,
}: {
  title: string;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
  icon?: LucideIcon | undefined;
  /** Its heading level: 2 right under the page title, 3 inside a titled panel. */
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon size={20} strokeWidth={1.75} />
        </div>
      )}
      <Heading>{title}</Heading>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** Inline, dismissible error banner for a failed action (e.g. a DB write). */
export function ErrorBanner({
  message,
  onDismiss,
  live = true,
}: {
  message: string;
  onDismiss?: (() => void) | undefined;
  /** False for a kept banner already announced on another page (ADR 0189). */
  live?: boolean;
}) {
  const t = useT();
  return (
    <div className="error-banner" role={live ? "alert" : undefined}>
      <span>{message}</span>
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
