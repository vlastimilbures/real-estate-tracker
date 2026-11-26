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

/** What a navigation asks its page to do once, tagged by the page (ADR 0269): open
 *  Properties' Add form (⌘N), bring a Guide glossary term into view, or land Property
 *  detail on a section or its form. A new `id` for every request, so a repeat is new. */
export type RouteRequest = { id: number } & (
  | { page: "properties" }
  | { page: "guide"; term: string }
  | { page: "property"; target: PropertyTarget }
);
