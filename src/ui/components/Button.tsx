// The app's buttons: one look per role (ADR 0201), and a segmented choice.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../../lib/cx";

/**
 * A segmented choice: one pressed button per option. An option with an icon shows only
 * the icon, its label as the button's name and tooltip; `className` adds to "segmented".
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: { value: T; label: string; icon?: LucideIcon | undefined }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cx("segmented", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          className={v === value ? "on" : ""}
          aria-pressed={v === value}
          title={Icon && label}
          aria-label={Icon && label}
          onClick={() => onChange(v)}
        >
          {Icon ? <Icon size={16} /> : label}
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
  const cls = cx("btn", variant !== "default" && variant, size);
  return (
    // type defaults to "button" so only an explicit type="submit" submits a form.
    <button className={cls} type={type} {...rest}>
      {Icon && <Icon size={14} strokeWidth={1.75} />}
      {children}
    </button>
  );
}
