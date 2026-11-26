// A state beside a figure: a pill for one that is not a band, a shaped marker for a
// health band (ADR 0195).
import type { ReactNode } from "react";
import { BAND_SHAPE, type Band } from "../model/health";

/** A pill for a state that is not a band beside a figure (Pending, Inactive, import
 *  status); a band uses HealthMarker (ADR 0195). */
export function Badge({ band, children }: { band: Band; children: ReactNode }) {
  return <span className={`badge ${band}`}>{children}</span>;
}

const MARKER_SHAPES = {
  circle: <circle cx="5" cy="5" r="5" />,
  triangle: <polygon points="5,0 10,9.5 0,9.5" />,
  diamond: <polygon points="5,0 10,5 5,10 0,5" />,
  ring: (
    <circle
      cx="5"
      cy="5"
      r="4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  ),
} as const;

/**
 * A health band as a shape in its colour, after the figure (ADR 0195). The shape is
 * hidden from assistive technology; the band word carries the meaning: visible with
 * `showWord` (a tile's foot), otherwise screen-reader text plus a hover tooltip (a table).
 */
export function HealthMarker({
  band,
  word,
  showWord = false,
}: {
  band: Band;
  word: string;
  showWord?: boolean | undefined;
}) {
  const shape = BAND_SHAPE[band];
  return (
    <span
      className={`health-marker ${band}`}
      title={showWord ? undefined : word}
    >
      <svg
        viewBox="0 0 10 10"
        width="10"
        height="10"
        aria-hidden="true"
        focusable="false"
        data-shape={shape}
      >
        {MARKER_SHAPES[shape]}
      </svg>
      {showWord ? (
        <span className="health-word">{word}</span>
      ) : (
        <span className="sr-only"> {word}</span>
      )}
    </span>
  );
}
