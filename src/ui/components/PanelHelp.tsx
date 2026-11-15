// A panel's explanation in its body (ADR 0214): a muted help line, or behind an
// "About this" disclosure when it runs longer than about one line.
import type { ReactNode } from "react";
import { Disclosure } from "./Disclosure";
import { useT } from "../hooks/useT";

export function HelpText({
  collapsed = false,
  children,
}: {
  collapsed?: boolean | undefined;
  children: ReactNode;
}) {
  const t = useT();
  const text = <p className="help-text">{children}</p>;
  return collapsed ? (
    <Disclosure label={t.common.aboutThis}>{text}</Disclosure>
  ) : (
    text
  );
}
