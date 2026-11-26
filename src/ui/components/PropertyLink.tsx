import type { MouseEvent } from "react";
import { useUiStore } from "../../state/uiStore";

/** A property's name as a link to its detail page: a real button, so the keyboard can
 *  drill in too. Long names are cut with an ellipsis; the full name shows on hover and
 *  stays the accessible name (ADR 0085). `stopPropagation` keeps a click from also
 *  reaching a row that opens the property itself (the Properties list). */
export function PropertyLink({
  id,
  name,
  stopPropagation = false,
}: {
  id: string;
  name: string;
  stopPropagation?: boolean;
}) {
  const openProperty = useUiStore((s) => s.openProperty);
  return (
    <button
      type="button"
      className="link-button cell-name"
      title={name}
      onClick={(e: MouseEvent) => {
        if (stopPropagation) e.stopPropagation();
        openProperty(id);
      }}
    >
      {name}
    </button>
  );
}
