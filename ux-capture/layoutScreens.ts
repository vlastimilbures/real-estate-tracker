// The layout screens that CI also captures in Czech and Russian (ADR 0158): their
// strings are longer, and these screens assert nothing is clipped or covered. CI selects
// them by tag (`pnpm ux:capture --grep @layout-i18n`, ci.yml and scripts/gates.mjs), so a
// renamed screen is never dropped from that run: screens/index.ts throws at load when an
// id here has no screen or is listed twice. capture.spec.ts tags each listed screen.

export const LAYOUT_TAG = "@layout-i18n";

export const LAYOUT_SCREENS: readonly string[] = [
  "01-dashboard",
  "03-dashboard-asof-5y",
  "03b-dashboard-real-asof-5y",
  "14-properties-long-name",
  "20-property-detail",
  "20b-property-detail-asof-5y",
  "27-property-section-nav-focus",
  "42-scenarios-compare",
];
