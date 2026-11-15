// A panel's explanation in its body (ADR 0214): a muted help line, or behind an
// "About this" disclosure when it runs longer than about one line.
import type { ReactNode } from "react";
import { Disclosure } from "./Disclosure";
import { useT } from "../hooks/useT";

export function HelpText({
  about,
  children,
}: {
  /** Collapse the text behind "About this"; the topic (the panel or section it
   *  explains) completes the button's accessible name, so two on a page differ. */
  about?: string | undefined;
  children: ReactNode;
}) {
  const t = useT();
  const text = <p className="help-text">{children}</p>;
  return about ? (
    <Disclosure
      label={
        <>
          {t.common.aboutThis}
          <span className="sr-only">: {about}</span>
        </>
      }
    >
      {text}
    </Disclosure>
  ) : (
    text
  );
}
