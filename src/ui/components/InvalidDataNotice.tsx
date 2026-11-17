import type { EngineInputError, Portfolio } from "../../engine";
import { invalidDataLines } from "../model/invalidData";
import { useT } from "../hooks/useT";
import { Button } from "./primitives";

/**
 * Stored data that breaks an engine rule (UX-049): which record, which rule, in the
 * user's language. `onOpenProperty`, when given, offers the property where it can be
 * corrected (the app-wide fallback); Property detail shows the records itself (UX-056).
 */
export function InvalidDataNotice({
  error,
  portfolio,
  onOpenProperty,
}: {
  error: EngineInputError;
  portfolio: Portfolio | null;
  onOpenProperty?: (propertyId: string) => void;
}) {
  const t = useT();
  const lines = invalidDataLines(t, error.errors, portfolio);
  const target = lines.find((l) => l.propertyId !== undefined)?.propertyId;
  return (
    <div className="error-boundary" role="alert">
      <h2>{t.errorBoundary.invalidDataTitle}</h2>
      <p>{t.errorBoundary.invalidDataBody}</p>
      <ul>
        {lines.map((l) => (
          <li key={l.text}>{l.text}</li>
        ))}
      </ul>
      {target !== undefined && onOpenProperty && (
        <Button type="button" onClick={() => onOpenProperty(target)}>
          {t.errorBoundary.openProperty}
        </Button>
      )}
    </div>
  );
}
