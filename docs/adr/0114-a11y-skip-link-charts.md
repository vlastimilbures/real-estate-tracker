# 0114. Accessibility round: skip link, named charts, legible axes

- Status: Accepted
- Date: 2026-10-03
- Source: issues #24 and #25 (pre-release review 2026-10, findings A11 and A12)
- Builds on: ADR 0078

## Context

- **No skip link.** From page load, a keyboard user tabs through the sidebar, language,
  theme, lens and property filters before reaching the page: the as-of input is tab stop
  21 in `90-keyboard-focus-order.json`.
- **Charts are unnamed tab stops.** Recharts 3 turns on its accessibility layer by default:
  each chart `<svg>` gets `tabIndex 0` and `role="application"`, and the arrow keys step the
  tooltip through the years. The surface has no accessible name; the focus capture records
  `svg.recharts-surface ""`.
- **Y-axis ticks wrap.** In Real mode a thousands-scaled axis shows "−300" and "k" on two
  lines. The axis passes its fixed width to the tick text, which breaks at ASCII spaces;
  our width was an estimate of 8 px per character.
- **Ticks miss their style.** The CSS asks for 10.5 px `--ink-faint` ticks, but Recharts 3
  draws tick labels outside the element that rule targets, so the rule matches nothing.
  Ticks render in Recharts' default 14 px; the theme fill set on the axis is all that
  keeps them legible. Without it, the default `#666` would be 2.72:1 on the dark surface.
  axe does not check SVG text, so no scan caught it.
- **Tooltip labels fail contrast.** Each label is drawn in its series colour. In light mode
  brass (`--series-2`, 3.81:1) and sand (`--series-5`, 4.02:1) miss 4.5:1 on `--surface`;
  axe flagged it when the pointer rested on a chart.
- **Compare lines differ by colour only.** On the scenario compare charts, "Rates +2pp"
  can lie almost on top of Base.

## Decision

Owner, 2026-10-03 (#24 + #25 plan):

1. **"Skip to content".** It is the first tab stop, hidden until it has focus. Enter or a
   click moves focus to the page content, `<main id="main" tabIndex={-1}>`. The route and
   URL do not change. It is a button, not a link: in WebKit (the app's WKWebView) Tab
   skips links unless the macOS setting "Press Tab to highlight each item" is on.
2. **Every chart surface has a name.** The `<svg>` gets `role="img"` and an `aria-label`:
   "<chart title> — chart. Use the Table button for the values." It stays a tab stop, and
   the arrow keys still step the tooltip.
3. **Ticks never wrap.** The Y axis takes its width from the longest rendered tick
   (Recharts measures it, and then gives the tick text no wrap width). The tick keeps its
   unit ("1 200 k", "12,5 M"). Its spaces are non-breaking as a backstop, in case a fixed
   width comes back.
4. **Ticks are 11 px in `--ink-soft`**: 5.32:1 in light and 6.29:1 in dark on `--surface`.
   The rule targets the tick label's own class. The capture checks the computed size and
   colour, because axe skips SVG text.
5. **Tooltip labels are in the text colour**, after a short line swatch in the series
   colour and dash. The legend uses the same swatch.
6. **Scenario compare lines carry a dash pattern** paired with their colour by position:
   the first line (Base, when shown) is solid, then `6 3`, `2 3` and `8 3 2 3`. The legend
   and the tooltip swatches match. The other charts keep solid lines.

## Consequences

Display and keyboard behaviour only: no computed number, parity target, golden master,
export or saved data changes. New strings in en, cs and ru. The Y axes can be narrower or
wider than before, because they now fit their ticks. Legend swatches change from a 10 px
bar to a 16 px line. The keyboard capture now records accessible names and checks the skip
link.

`role="img"` on a focusable surface is a deliberate trade-off. VoiceOver, the app's screen
reader, announces the name and leaves the arrow keys to the chart. A browse-mode screen
reader (NVDA, JAWS) would keep the arrow keys for itself. Either way, the Table button
stays the way to read the values (ADR 0078).
