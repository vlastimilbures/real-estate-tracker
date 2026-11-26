// Page layout: the panel, a scrolling table region, a key/value list, the empty state
// and the inline error banner.
import { useCallback, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { useT } from "../hooks/useT";
import { InfoTip } from "./InfoTip";
import { PanelSection } from "./panelFocus";
import { cx } from "../../lib/cx";

/** Horizontally/vertically scrolling table container: a named region keyboard users can
 *  Tab to and scroll with the arrow keys. */
export function TableWrap({
  label,
  className,
  style,
  children,
}: {
  label: string;
  /** Extra classes after `table-wrap`, such as a margin utility. */
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={className ? `table-wrap ${className}` : "table-wrap"}
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
  headingId,
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
  /** An id for the title, so focus can be sent to it (ADR 0248 §3). */
  headingId?: string | undefined;
  children: ReactNode;
}) {
  // Its section, for a control inside that sends focus here once it closes (ADR 0173).
  const section = useRef<HTMLElement>(null);
  const sectionOf = useCallback(() => section.current, []);
  return (
    <PanelSection.Provider value={sectionOf}>
      <section className="panel" ref={section}>
        {(title || action) && (
          <div className="panel-head">
            <div className="panel-head-titles">
              {/* Focusable from script only: an in-page link lands here (ADR 0107). */}
              {title && (
                <h2 id={headingId} tabIndex={-1}>
                  {title}
                </h2>
              )}
              {hint && <span className="hint">{hint}</span>}
              {info && title && <InfoTip topic={title}>{info}</InfoTip>}
            </div>
            {action}
          </div>
        )}
        {badges && <div className="panel-badges">{badges}</div>}
        <div className={cx("panel-body", flush && "flush")}>
          {help && <div className="panel-help">{help}</div>}
          {children}
        </div>
      </section>
    </PanelSection.Provider>
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
    <div className="banner error" role={live ? "alert" : undefined}>
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
