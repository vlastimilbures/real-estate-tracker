// One disclosure for every show/hide (ADR 0203): a quiet chevron button with
// aria-expanded and aria-controls naming a region that is always in the DOM.
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./Button";
import { useDisclosure, type OpenState } from "../hooks/useDisclosure";

/** The toggle: ghost, small, chevron down when shut and up when open. `controls` is the
 *  id of the region it shows and hides, which stays in the DOM (`hidden` while shut). */
export function DisclosureButton({
  open,
  controls,
  onToggle,
  children,
}: {
  open: boolean;
  controls: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={open ? ChevronUp : ChevronDown}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      {children}
    </Button>
  );
}

/** A section shown and hidden by its button, which leads the line it opens. Its open
 *  state is its own (not remembered) unless the caller passes `open`. */
export function Disclosure({
  label,
  children,
  ...state
}: OpenState & {
  label: ReactNode;
  children: ReactNode;
}) {
  const { open, id, toggle } = useDisclosure(state);
  return (
    <div className="disclosure">
      <DisclosureButton open={open} controls={id} onToggle={toggle}>
        {label}
      </DisclosureButton>
      <div id={id} className="disclosure-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
