// A panel's instruction in its body (ADR 0214, 0217): a muted help line the user needs in
// order to act. A definition goes behind an info icon instead (`InfoTip`).
import type { ReactNode } from "react";

export function HelpText({ children }: { children: ReactNode }) {
  return <p className="help-text">{children}</p>;
}
