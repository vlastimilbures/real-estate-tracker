// Ties a Field's <label> and error/hint text to the control rendered inside it (UX-018).
// Kept apart from forms.tsx so DateInput can read it without an import cycle.
import { createContext, useContext } from "react";

export interface FieldControl {
  id: string;
  invalid: boolean;
  required?: boolean | undefined;
  describedBy?: string | undefined;
}

export const FieldContext = createContext<FieldControl | null>(null);

/** Props a control spreads before its own (explicit props still win). */
export function useFieldControlProps(): {
  id?: string | undefined;
  "aria-invalid"?: true | undefined;
  "aria-required"?: true | undefined;
  "aria-describedby"?: string | undefined;
} {
  const f = useContext(FieldContext);
  if (!f) return {};
  return {
    id: f.id,
    ...(f.invalid ? { "aria-invalid": true as const } : {}),
    ...(f.required ? { "aria-required": true as const } : {}),
    ...(f.describedBy ? { "aria-describedby": f.describedBy } : {}),
  };
}
