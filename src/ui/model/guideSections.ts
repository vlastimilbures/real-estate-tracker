// The Guide's sections for its section nav (ADR 0213): page order, element ids, and the
// section titles as link labels.
import type { Dictionary } from "../../i18n";

const KEYS = [
  ["howItWorks", "howItWorksTitle"],
  ["snapshot", "snapshotTitle"],
  ["mortgages", "mortgagesTitle"],
  ["projection", "projectionTitle"],
  ["nominalReal", "nominalRealTitle"],
  ["returns", "returnsTitle"],
  ["scenarios", "scenariosTitle"],
  ["development", "developmentTitle"],
  ["glossary", "glossaryTitle"],
  ["limits", "limitsTitle"],
] as const;

export type GuideSection = (typeof KEYS)[number][0];

/** The element id a Guide section's link points at. */
export const guideSectionId = (s: GuideSection) => `guide-${s}`;

/** The Guide's sections in page order, each with its id and its title as the label. */
export function guideSections(
  t: Pick<Dictionary, "guide">,
): { id: string; label: string }[] {
  return KEYS.map(([key, title]) => ({
    id: guideSectionId(key),
    label: t.guide[title],
  }));
}
