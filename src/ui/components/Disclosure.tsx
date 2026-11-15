// One disclosure for every show/hide (ADR 0203): a quiet chevron button with
// aria-expanded and aria-controls naming a region that is always in the DOM.
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./primitives";

/** The toggle: ghost, small, chevron down when shut and up when open. `controls` is the
 *  id of the region it shows and hides, which stays in the DOM (`hidden` while shut). */
export function DisclosureButton({
  open,
  controls,
  onToggle,
  disabled,
  children,
}: {
  open: boolean;
  controls: string;
  onToggle: () => void;
  disabled?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={open ? ChevronUp : ChevronDown}
      aria-expanded={open}
      aria-controls={controls}
      disabled={disabled}
      onClick={onToggle}
    >
      {children}
    </Button>
  );
}

/** A section whose open state is its own (not remembered): the button leads the line it
 *  opens. `defaultOpen` is read when it mounts; key it by the default to follow a change. */
export function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  defaultOpen?: boolean | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="disclosure">
      <DisclosureButton
        open={open}
        controls={id}
        onToggle={() => setOpen((o) => !o)}
      >
        {label}
      </DisclosureButton>
      <div id={id} className="disclosure-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
