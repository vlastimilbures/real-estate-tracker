# 0195. Health marker: colour and shape after the figure instead of a pill

- Status: Accepted
- Date: 2026-11-15
- Source: issue #373 (UX/UI review 2026-11, tracking #392); owner decision 2026-11-15
  (a marker follows the figure; colour and shape per band; the word as screen-reader text
  and tooltip; a legend under a table; the word visible in a tile's foot)
- Related: [0126](0126-degenerate-kpis.md) and [0133](0133-ltv-yield-zero-value.md) (no
  band, no badge), [0158](0158-layouts-hold-in-czech-and-russian.md) (`bandPillParts`,
  still used by the Properties table until #379)
- Amended by: [0200](0200-dashboard-kpi-strip.md) (§3: the Dashboard LTV and DSCR tiles
  show the marker and word only)

## Context

1. LTV and DSCR bands are shown as a coloured pill (`Badge`). On a KPI tile the pill
   shares the label's row and pushes the label onto two lines ("PORTFOLIO / LTV",
   capture `01-dashboard`); the Property detail tiles do the same (`20-property-detail`).
2. In the Properties table the pill wraps the figure and the word, so the rows are 64 px
   tall and the figures do not line up (`10-properties`). That table adopts the marker in
   #379.
3. Colour alone must not carry the band (WCAG 1.4.1), and a graphic that carries meaning
   needs 3:1 against what is behind it (WCAG 1.4.11).

## Decision

1. **A `HealthMarker` primitive** draws a 10 × 10 px shape in the band's colour. It is
   decorative to assistive technology (`aria-hidden`); the band word carries the meaning.
   Each band has its own shape, so the bands still differ in greyscale:

   | Band    | Shape           | Colour       |
   | ------- | --------------- | ------------ |
   | good    | filled circle   | `--positive` |
   | warn    | filled triangle | `--warn`     |
   | bad     | filled diamond  | `--negative` |
   | neutral | hollow ring     | `--ink-soft` |

   Bands, thresholds and words still come from `src/ui/model/health.ts` and do not change.

2. **Two forms.** In the _labelled_ form the word is visible next to the marker. In the
   _compact_ form the word is visually hidden text after the figure, so a screen reader
   still hears "28,1 % Conservative", and it shows as a tooltip (`title`) on hover.
3. **KPI tiles use the labelled form in the foot.** The label row holds only the label.
   The foot starts with the marker and the word, then `·` and the foot text the tile
   already has ("▲ Moderate · Debt ÷ value"). This applies to the Dashboard Portfolio LTV
   and Portfolio DSCR tiles and the Property detail Debt (LTV) and DSCR tiles. A tile with
   no band (LTV with no value, DSCR with no debt) shows no marker, as before (ADR 0126,
   0133). `KpiTile`'s `badge` prop becomes `health`.
4. **Tables use the compact form after the figure, with a legend.** A one-line legend
   under the table shows each shape that occurs with its word, in the same order as the
   table above ("● Conservative ▲ Moderate ◆ High"). The legend is built with its first
   table, the Properties list (#379), so no unused component ships before then.
5. **Contrast.** Every marker colour has at least 3:1 against `--surface` and against a
   hovered table row (`--hover-wash` over `--surface`) in light and dark;
   `contrast.test.ts` checks this. Today's tokens pass (lowest 4.92:1), so no colour
   changes.
6. **`Badge` stays** for states that are not a band beside a figure (Pending, Inactive,
   import status) and for the Properties table pills until #379 replaces them.

## Consequences

- The tile labels "Portfolio LTV" and "Portfolio DSCR" fit on one line at 1280 × 800 in
  en, cs and ru. The band word moves from the top right of the tile to the start of its
  foot.
- No computed number, threshold or dictionary text changes.
- The KPI strip (#375), the Properties list (#379) and the Property detail top bar (#384)
  build on the primitive.
