# 0213. Guide: section navigation

- Status: Accepted (delegated, owner review pending)
- Date: 2026-11-16
- Source: issue #390 (UX/UI review 2026-11, tracking #392); direction approved by the
  owner on 2026-11-15 (the issue's decision); acceptance delegated by the owner for the
  2026-11-15 run (comment on #392)
- Amends: [0107](0107-property-section-nav.md) (its section navigation now also serves
  the Guide)
- Related: [0158](0158-layouts-hold-in-czech-and-russian.md) (the nav wraps)

## Context

The Guide is one page of ten sections, about 5,800 px tall, with no way to jump to a
section.

## Decision

1. **Section links under the title.** The Guide's top bar carries the section navigation
   of Property detail (`SectionNav`, ADR 0107), named `guide.sectionNavLabel` ("Guide
   sections"), one link per section in page order, labelled with the section's own title:
   How it works, Snapshot metrics, Mortgages & fixation, Projection to the horizon,
   Nominal vs Real, Returns over the horizon, Scenarios, Development properties, Glossary,
   Limits and data safety. Shaping: `guideSections` (`src/ui/model/guideSections.ts`).
2. **Same behaviour.** A link scrolls its section under the sticky top bar and moves focus
   to the section's heading; the current section is marked while scrolling
   (`useSectionSpy`); the links wrap onto more rows rather than scroll sideways (ADR 0158).
3. **Landing.** Opening the Guide lands at its top; a glossary term opened from a metric
   label still lands on that term (UX-044).
4. The Guide's content and wording are unchanged.

## Consequences

- Every Guide section is one click or one Tab-and-Enter from the top bar.
- No computed number, stored data or export changes.
- New dictionary entry in en, cs and ru: `guide.sectionNavLabel`.
