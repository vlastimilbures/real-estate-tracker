// The open dialogs and popovers that own Escape, top-most last (ADR 0157): Escape and the
// Tab trap act on the top one only, so one Escape closes one layer. The one module-level
// state in src/ui: a layer pushes itself while it is on the page and pops itself
// when it leaves (useDismiss).

interface Entry {
  /** A modal dialog (aria-modal): the native menu's items wait while one is open. */
  modal: boolean;
}

const stack: Entry[] = [];

/** One open layer. */
export interface Layer {
  /** Whether no layer opened after this one is still open. */
  isTop(): boolean;
  /** Takes it off the stack; again is a no-op. */
  pop(): void;
}

/** Puts a new layer on top; `modal` for a modal dialog, not for a dropdown's list. */
export function pushLayer({ modal = false }: { modal?: boolean } = {}): Layer {
  const self: Entry = { modal };
  stack.push(self);
  return {
    isTop: () => stack.at(-1) === self,
    pop: () => {
      const i = stack.indexOf(self);
      if (i >= 0) stack.splice(i, 1);
    },
  };
}

/** True while a dialog or a dropdown's list is open: it owns Escape (ADR 0157, ADR 0173).
 *  The date popover and the tips are not layers (useDismiss's `escape` orders). */
export const anyOpen = (): boolean => stack.length > 0;

/** True while a modal dialog is open (Modal: About, the leave guard, the forms, the
 *  confirmations); a dropdown's list does not count. */
export const modalOpen = (): boolean => stack.some((l) => l.modal);
