import type { EngineInputError, Portfolio } from "../../engine";
import { invalidDataLines, leftoverBlockHints } from "../model/invalidData";
import { sectionId, type PropertySection } from "../model/sectionNav";
import { useT } from "../hooks/useT";
import { focusSection } from "./focusSection";
import { Button } from "./primitives";

/**
 * Stored data that breaks an engine rule (UX-049): which record, which rule, in the
 * user's language. `onOpenProperty`, when given, offers the property where it can be
 * corrected (the app-wide fallback); Property detail shows the records itself (UX-056).
 * A leftover mortgage block adds a hint naming both start dates, and the way to Financing:
 * "Open property" lands there, or, on Property detail, "Go to Financing" (ADR 0258).
 */
export function InvalidDataNotice({
  error,
  portfolio,
  onOpenProperty,
}: {
  error: EngineInputError;
  portfolio: Portfolio | null;
  onOpenProperty?: (propertyId: string, section?: PropertySection) => void;
}) {
  const t = useT();
  const lines = invalidDataLines(t, error.errors, portfolio);
  const hints = leftoverBlockHints(t, error.errors, portfolio);
  const target = lines.find((l) => l.propertyId !== undefined)?.propertyId;
  const toFinancing = hints.some((h) => h.propertyId === target);
  return (
    <div className="error-boundary" role="alert">
      <h2>{t.errorBoundary.invalidDataTitle}</h2>
      <p>{t.errorBoundary.invalidDataBody}</p>
      <ul>
        {[...lines, ...hints].map((l) => (
          <li key={l.text}>{l.text}</li>
        ))}
      </ul>
      {target !== undefined && onOpenProperty && (
        <Button
          type="button"
          onClick={() =>
            onOpenProperty(target, toFinancing ? "financing" : undefined)
          }
        >
          {t.errorBoundary.openProperty}
        </Button>
      )}
      {!onOpenProperty && hints.length > 0 && (
        <Button
          type="button"
          onClick={() => focusSection(sectionId("financing"))}
        >
          {t.dataCheck.goTo(t.propertyDetail.sectionFinancing)}
        </Button>
      )}
    </div>
  );
}
