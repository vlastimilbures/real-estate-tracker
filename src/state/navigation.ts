// Where the app is and how it shows it: the pages, the Settings tabs, the Property detail
// sections and landing targets, and the Nominal/Real lens. State owns these types, so it
// imports none from the UI; ui/model re-exports the ones its own modules use.

export type Route =
  | "dashboard"
  | "properties"
  | "property"
  | "projections"
  | "scenarios"
  | "import"
  | "settings"
  | "guide";

/** Which sub-tab the Settings page opens on. */
export type SettingsTab = "assumptions" | "backup";

/** The Nominal/Real lens: which money terms the screens show. */
export type Mode = "nominal" | "real";

/** Property detail's sections, for its section nav (ADR 0107). */
export type PropertySection =
  | "overview"
  | "dataCheck"
  | "records"
  | "financing"
  | "acquisition"
  | "holding"
  | "projection"
  | "amortization";

/** The property form as a landing target: plain, or opened at its Acquisition section
 *  (a Data check link, ADR 0118). */
export type PropertyFormTarget = "edit" | "editFunding";

/** Where Property detail lands once: a section, or the open property form (ADR 0118). */
export type PropertyTarget = PropertySection | PropertyFormTarget;
