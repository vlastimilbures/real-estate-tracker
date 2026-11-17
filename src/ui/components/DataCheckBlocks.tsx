// The Data check's shared parts (ADR 0223), on the Dashboard and Property detail: the
// counts as pills for the line under the panel head, a block per list ("Needs attention", "Using
// portfolio defaults") of hairline rows — icon, problem, the fix on the right — and the
// all-clear line.
import { useId, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useT } from "../hooks/useT";
import "../styles/data-check.css";

export type DataCheckKind = "attention" | "defaults";

/** The counts, on their own line under the panel head (ADR 0223 §1). */
export function DataCheckCounts({
  attention,
  defaults,
}: {
  attention: number;
  defaults: number;
}) {
  const d = useT().dataCheck;
  return (
    <span className="dc-pills">
      {attention > 0 ? (
        <span className="dc-pill warn">
          <AlertTriangle size={14} aria-hidden="true" />
          {d.needAttention(attention)}
        </span>
      ) : (
        <span className="dc-pill ok">
          <CheckCircle2 size={14} aria-hidden="true" />
          {d.attentionNone}
        </span>
      )}
      {defaults > 0 && (
        <>
          {/* Two counts, two phrases for a screen reader too. */}
          <span className="sr-only"> · </span>
          <span className="dc-pill">
            <Info size={14} aria-hidden="true" />
            {d.useDefaults(defaults)}
          </span>
        </>
      )}
    </span>
  );
}

/** Nothing to report: one quiet line (ADR 0223 §4). */
export function DataCheckClear() {
  const d = useT().dataCheck;
  return (
    <p className="dc-clear">
      <CheckCircle2 size={16} aria-hidden="true" />
      {d.attentionNone}
    </p>
  );
}

/** The blocks, side by side on a wide container, stacked on a narrow one. */
export function DataCheckBlocks({ children }: { children: ReactNode }) {
  return (
    <div className="dc-blocks-wrap">
      <div className="dc-blocks">{children}</div>
    </div>
  );
}

/** One list under its heading, which names it. */
export function DataCheckBlock({
  kind,
  title,
  children,
}: {
  kind: DataCheckKind;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`dc-block ${kind}`}>
      <h3 id={id} className="dc-block-head">
        {title}
      </h3>
      {/* An explicit list role: WebKit drops it from a list without bullets, and with it
          the list's name. */}
      <ul role="list" className="dc-rows" aria-labelledby={id}>
        {children}
      </ul>
    </div>
  );
}

/** A finding: its icon, the problem (`textId`, which its actions may cite), then the
 *  actions on the right. */
export function DataCheckRow({
  kind,
  text,
  textId,
  children,
}: {
  kind: DataCheckKind;
  text: string;
  textId: string;
  children: ReactNode;
}) {
  const Icon = kind === "attention" ? AlertTriangle : Info;
  return (
    <li className="dc-row">
      <Icon className="dc-icon" size={16} aria-hidden="true" />
      <p className="dc-problem" id={textId}>
        {text}
      </p>
      <div className="dc-row-actions">{children}</div>
    </li>
  );
}
