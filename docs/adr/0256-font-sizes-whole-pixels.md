# 0256. Font sizes are whole pixels: half sizes round up

- Status: Accepted
- Date: 2026-11-18
- Source: #495 (part 4, parked item 1; plan in #495 comment 6974475115, "PR B"); owner
  decision 2026-11-18 (#435 comment 6965976270); tracking #435
- Related: none set these sizes. They were raw values until #495's neutral parts (PR #547)
  named them `--fs-11-5`, `--fs-12-5` and `--fs-13-5`, and stylelint has allowed only
  `var(--fs-*)` for `font-size` since then.

## Context

The stylesheets used 15 font sizes. Three were half pixels, each one 0.5 px from a whole
size that is also in use: 11.5 px (9 rules), 12.5 px (14 rules) and 13.5 px (15 rules).
Nothing in the design calls for the halves. They make the type scale harder to read and
render differently from one display to another. The owner chose to round them **up**,
which never makes text smaller.

## Decision

1. **The half sizes round up.** 11.5 → 12 px, 12.5 → 13 px, 13.5 → 14 px. The tokens
   `--fs-11-5`, `--fs-12-5` and `--fs-13-5` are removed, and their users read `--fs-12`,
   `--fs-13` and `--fs-14`. No other value changes: line heights, paddings, widths and
   the other sizes stay as they are.

   | Rule                                                          | File                             | Before → after (px) |
   | ------------------------------------------------------------- | -------------------------------- | ------------------- |
   | `.legend` (chart legends)                                     | `src/ui/components/charts.css`   | 11.5 → 12           |
   | `.field .err`                                                 | `src/ui/components/forms.css`    | 11.5 → 12           |
   | `.field .help` (field help)                                   | `src/ui/components/forms.css`    | 11.5 → 12           |
   | `.event-rows > .help`                                         | `src/ui/components/forms.css`    | 11.5 → 12           |
   | `.event-rows .err`                                            | `src/ui/components/forms.css`    | 11.5 → 12           |
   | `.event-row > .note`                                          | `src/ui/components/forms.css`    | 11.5 → 12           |
   | `.tile.compact .foot`                                         | `src/ui/components/panel.css`    | 11.5 → 12           |
   | `.fx-next`                                                    | `src/ui/styles/loan-outlook.css` | 11.5 → 12           |
   | `.fx-legend`                                                  | `src/ui/styles/loan-outlook.css` | 11.5 → 12           |
   | `.date-popover .rdp-root` (the calendar)                      | `src/ui/components/forms.css`    | 12.5 → 13           |
   | `.event-rows > .total`                                        | `src/ui/components/forms.css`    | 12.5 → 13           |
   | `.help-text`                                                  | `src/ui/components/panel.css`    | 12.5 → 13           |
   | `.panel-note` (panel notes)                                   | `src/ui/components/panel.css`    | 12.5 → 13           |
   | `.title-pill`                                                 | `src/ui/components/shell.css`    | 12.5 → 13           |
   | `.about-version`                                              | `src/ui/styles/about.css`        | 12.5 → 13           |
   | `.about-meta dt`                                              | `src/ui/styles/about.css`        | 12.5 → 13           |
   | `.about-foot`                                                 | `src/ui/styles/about.css`        | 12.5 → 13           |
   | `.dc-chip`                                                    | `src/ui/styles/data-check.css`   | 12.5 → 13           |
   | `.guide-formula`                                              | `src/ui/styles/guide.css`        | 12.5 → 13           |
   | `.guide-caveat`                                               | `src/ui/styles/guide.css`        | 12.5 → 13           |
   | `.guide-eg`                                                   | `src/ui/styles/guide.css`        | 12.5 → 13           |
   | `.info-tip-pop`                                               | `src/ui/styles/info-tip.css`     | 12.5 → 13           |
   | `.fx-figure .fx-sub`                                          | `src/ui/styles/loan-outlook.css` | 12.5 → 13           |
   | `.field input:not([type="checkbox"]), .field select` (inputs) | `src/ui/components/forms.css`    | 13.5 → 14           |
   | `.field textarea`                                             | `src/ui/components/forms.css`    | 13.5 → 14           |
   | `.event-row.lead .lead-date .value`                           | `src/ui/components/forms.css`    | 13.5 → 14           |
   | `.statlist .k` (stat lists)                                   | `src/ui/components/panel.css`    | 13.5 → 14           |
   | `.statlist .v` (stat lists)                                   | `src/ui/components/panel.css`    | 13.5 → 14           |
   | `.acq-empty > p`                                              | `src/ui/components/panel.css`    | 13.5 → 14           |
   | `.nav button` (the nav)                                       | `src/ui/components/shell.css`    | 13.5 → 14           |
   | `.about-tagline`                                              | `src/ui/styles/about.css`        | 13.5 → 14           |
   | `.about-prose`                                                | `src/ui/styles/about.css`        | 13.5 → 14           |
   | `.about-meta dd`                                              | `src/ui/styles/about.css`        | 13.5 → 14           |
   | `.guide-card h3`                                              | `src/ui/styles/guide.css`        | 13.5 → 14           |
   | `.guide-def-desc`                                             | `src/ui/styles/guide.css`        | 13.5 → 14           |
   | `.guide-prose`                                                | `src/ui/styles/guide.css`        | 13.5 → 14           |
   | `.guide-docs`                                                 | `src/ui/styles/guide.css`        | 13.5 → 14           |
   | `.import-summary-file`                                        | `src/ui/styles/import.css`       | 13.5 → 14           |

2. **Font sizes stay whole pixels.** `src/ui/styles/__tests__/fontSizesWhole.test.ts`
   fails on any fractional px `font-size` declaration or `--fs-*` token in `src/**/*.css`,
   and on any use of the three removed tokens. The stylelint rule that `font-size` reads a
   `--fs-*` token stays.

## Why round up

- Rounding up never makes text smaller, so no text loses legibility, and contrast is
  unaffected (colours do not change).
- The +0.5 px is at most 4.3 % (11.5 → 12), and the next sizes up (12, 13, 14) already
  sit next to these rules, so the hierarchy stays the same.

## Risk

Wider text can wrap or be cut off where space is tight: the nav at the minimum window
(900 × 600), table headers, the KPI band labels, field help under narrow inputs and the
calendar popover. The full ux:capture matrix checks this (below).

## Capture results

Full matrix, 2026-11-18: en, cs and ru × light and dark × 1280×800, min (900×600),
1200×800 and 1100×800. That is 24 variants of 88 screens plus 2 manifest checks (2160 runs, 2424 screenshots),
against origin/main @ acc99bc8 (`git archive`, `pnpm install --offline`).

| Check                                   | Before                   | After                                                                                                             |
| --------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Screens run, layout assertions included | 2160 passed              | 2160 passed (one boot timeout, `.sidebar` not visible within 30 s on 29g en-light-1200x800, passed on its re-run) |
| axe (`pnpm ux:axe-check`)               | 2328 scans, 0 violations | 2328 scans, 0 violations                                                                                          |
| `pnpm ux:diff`                          | —                        | 2328 of 2424 shots changed (the nav and inputs are on every screen)                                               |
| Screenshot width                        | —                        | none changed                                                                                                      |
| Screenshot height                       | —                        | 782 shots taller: 1–48 px, the Guide 83–322 px                                                                    |

A DOM probe ran the same screens on both trees. For every text node it recorded how many
lines the node renders on, and for every element with `overflow: hidden/clip` or
`text-overflow: ellipsis` whether its content is wider or taller than its box. It found:

- **No text newly cut off or truncated, and no new horizontal scroll** in any variant.
- **No new wrap in the nav, a table header, a KPI tile label, a tab, a button or a page
  title**, including at the minimum window.
- **New wraps** (a text node one line longer) on 59 screens. Each is in a rule listed
  above, or (`.dc-problem`) beside one. The page grows by one line, nothing overlaps, and
  dark matches light:

  | Rule                                                                               | Screens                                                                                     | Where                                                                                 |
  | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
  | `.panel-note`                                                                      | the Dashboard and the screens over it (00f, 01, 03–09b, 29d, 29g–29i, 65, 68, 81, 82, 90-*) | cs 1100×800                                                                           |
  | `.panel-note`                                                                      | 02, 03b (real terms)                                                                        | cs 1280×800                                                                           |
  | `.panel-note` (acquisition form)                                                   | 15                                                                                          | ru, every viewport                                                                    |
  | `.statlist .k` (dashboard stat list)                                               | the Dashboard screens as above                                                              | ru 1280×800; en 1100×800 on 02, 03b, 05; ru 1200×800 on 29g; cs and ru 1200×800 on 68 |
  | `.tile.compact .foot`                                                              | 05; 29e, 29f; 29g; 29h, 29i                                                                 | cs and en 1100×800; cs min; cs and en 1200×800; ru 1100×800                           |
  | `.acq-empty > p`                                                                   | every Property detail screen (20–31, 83, 84)                                                | cs and en 1100×800                                                                    |
  | `.info-tip-pop`                                                                    | 21d                                                                                         | cs and en, every viewport                                                             |
  | `.field .help`                                                                     | 11, 12, 15                                                                                  | cs 1100, 1200 and 1280×800                                                            |
  | `.field .help`                                                                     | 22, 25, 28 (loan form)                                                                      | cs and en 1200×800                                                                    |
  | `.field .help`                                                                     | 60–63, 66 (Assumptions)                                                                     | ru 1100×800 and min                                                                   |
  | `.event-rows > .help`                                                              | 22, 25, 28                                                                                  | en min; cs min on 25                                                                  |
  | `.field .err`                                                                      | 62                                                                                          | en 1200×800                                                                           |
  | `.import-summary-file`                                                             | 55                                                                                          | en 1100×800, ru min                                                                   |
  | `.dc-problem` (13 px, unchanged, beside the larger `.dc-chip`)                     | 05b                                                                                         | ru 1100×800                                                                           |
  | `.guide-formula`, `.guide-def-desc`, `.guide-card h3`, `.guide-eg`, `.guide-prose` | 70, 70b (Guide)                                                                             | every language and viewport                                                           |

The before/after crops of each group are evidence for the pull request and are not kept
in the repository.

## Consequences

- The app uses 12 font sizes: 11 whole-pixel tokens plus `--fs-h3` (1.17em).
- Text in the listed rules is 0.5 px larger.
- The remaining near sizes (15 vs 16, 19 vs 18 or 20, 1.17em vs 16 px) stay open in #495.
