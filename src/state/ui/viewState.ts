// Per-page view state kept for the session: the Dashboard filter and as-of date, the
// panels a page remembers as open, the About dialog, and the last import's report.
import type { CsvImportReport } from "../csv";
import type { SliceCtx } from "./types";

export interface ViewStateSlice {
  /** Dashboard property filter. Empty = whole portfolio ("All"). In-memory only. */
  dashboardPropertyIds: string[];
  setDashboardPropertyIds: (ids: string[]) => void;
  /** Snapshot "as of" date for Dashboard + Property detail. null = today. */
  asOf: Date | null;
  setAsOf: (date: Date | null) => void;
  /** Whether the About modal is open. Opened from the native macOS menu. In-memory only. */
  aboutOpen: boolean;
  openAbout: () => void;
  closeAbout: () => void;
  /** The Scenarios panel's "Add from preset": a manual open or close for the session,
   *  or null when the user has not chosen and the page decides on open (ADR 0106, 0220). */
  presetsOpen: boolean | null;
  setPresetsOpen: (open: boolean) => void;
  /** Property detail's amortization schedule is expanded. In-memory for the session,
   *  across properties (ADR 0107). */
  amortizationOpen: boolean;
  setAmortizationOpen: (open: boolean) => void;
  /** Dashboard data check: a manual Show / Hide for the session, or null when the page
   *  decides (open when something needs attention, ADR 0118). */
  dataCheckOpen: boolean | null;
  setDataCheckOpen: (open: boolean) => void;
  /** The last CSV import's report, kept until the next import or until the data is
   *  replaced (ADR 0096, ADR 0154). In-memory. */
  lastImport: CsvImportReport | null;
  setLastImport: (report: CsvImportReport | null) => void;
}

export function viewStateSlice({ set }: SliceCtx): ViewStateSlice {
  return {
    dashboardPropertyIds: [],
    setDashboardPropertyIds: (ids) => set({ dashboardPropertyIds: ids }),
    asOf: null,
    setAsOf: (date) => set({ asOf: date }),
    aboutOpen: false,
    openAbout: () => set({ aboutOpen: true }),
    closeAbout: () => set({ aboutOpen: false }),
    presetsOpen: null,
    setPresetsOpen: (presetsOpen) => set({ presetsOpen }),
    amortizationOpen: false,
    setAmortizationOpen: (amortizationOpen) => set({ amortizationOpen }),
    dataCheckOpen: null,
    setDataCheckOpen: (dataCheckOpen) => set({ dataCheckOpen }),
    lastImport: null,
    setLastImport: (lastImport) => set({ lastImport }),
  };
}
