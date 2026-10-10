// English dictionary — the source of truth. `Dictionary = typeof en`, and cs.ts / ru.ts
// are annotated `: Dictionary`, so any key added here that they don't mirror is a tsc
// error. Leaves are plain strings or `(params) => string` for interpolation/plurals.
//
// Number/date/currency formatting is NOT localized (see src/lib/format.ts): the app is a
// single-currency Czech tracker, so amounts stay "28 730 000 Kč" and dates dd.mm.yyyy in
// every language. Only UI chrome is translated; `about.formatsNote` tells the user (ADR 0105).
import type { LoanEventIssue, ValidationCode } from "../engine";
import { enPlural } from "./plural";
import { APP_NAME } from "./appName";

export const en = {
  common: {
    /** A KPI with no value, e.g. a levered IRR (UX-079). */
    notApplicable: "n/a",
    /** The development tranches not drawn yet, beside the drawn debt (ADR 0169). */
    undrawnDebt: (amount: string) => `plus ${amount} still to draw`,
    /** A development property's completed value, beside its value less the tranches
     *  not drawn yet (ADR 0169). */
    completedValue: (amount: string) => `completed value ${amount}`,
    irrNotUnique:
      "No unique IRR: the cash flows break even at more than one rate",
    irrNoRoot: "No IRR between −90 % and +1000 %",
    /** Unit shown inside year-count fields (UX-034). */
    yearsSuffix: "yrs",
    asOfGroup: "As of date",
    plusYears: (n: number) => `+${n}y`,
    searchProperties: "Search properties",
    /** A dropdown trigger naming a multiple selection (ADR 0157). */
    nSelected: (n: number) => `${n} selected`,
    /** Screen-reader name of a table's edit/delete column (ADR 0157). */
    actions: "Actions",
    searchPlaceholder: "Search…",
    /** Short word for thousands on chart axes (UX-034). */
    thousandsShort: "k",
    cancel: "Cancel",
    save: "Save",
    create: "Create",
    saveChanges: "Save changes",
    unsavedTitle: "Discard unsaved changes?",
    unsavedBody: "Your changes on this page have not been saved.",
    discardChanges: "Discard changes",
    // Save-row state and error summary (ADR 0095).
    unsavedChanges: "Unsaved changes",
    allChangesSaved: "All changes saved",
    saveFailedKept: "Save failed — your input is kept",
    fieldsNeedAttention: (n: number) =>
      `${n} ${enPlural(n, ["field needs", "fields need"])} attention:`,
    keepEditing: "Keep editing",
    edit: "Edit",
    delete: "Delete",
    yesDelete: "Yes, delete",
    confirmDeleteRow: "Delete this record?",
    deleting: "Deleting…",
    // A reload after a save failed (UX-050, DR-086)
    staleData:
      "The change may not be shown yet: reloading the data failed. Reload to see what is saved.",
    reload: "Reload",
    saving: "Saving…",
    close: "Close",
    dismiss: "Dismiss",
    noneYet: "None yet.",
    today: "Today",
    all: "All",
    addVerb: "Add",
    asOfLabel: "As of",
    asOfHintProjection: (year: string, period: string) =>
      `Future dates show the nearest projection year (${year}, ${period})`,
    asOfHintSnapshot: (d: string) => `Showing records in force on ${d}`,
    noPortfolioTitle: "No portfolio yet",
    noPortfolioBody: "Add a property or import CSV files to begin.",
    /** Every property is deactivated: the pages say so instead of "no portfolio" (ADR 0155). */
    allInactiveTitle: (n: number) =>
      n === 1
        ? "The only property is deactivated"
        : `All ${n} properties are deactivated`,
    allInactiveBody:
      "The records are kept. Figures cover active properties only: open a property and choose Activate to include it again.",
    openProperties: "Open Properties",
    importCsv: "Import CSV",
    nominal: "Nominal",
    real: "Real",
    // Lowercase lens words used mid-sentence (e.g. "5.0× today · nominal").
    nominalLower: "nominal",
    realLower: "real",
  },

  app: {
    loadingEyebrow: APP_NAME,
    loading: "Loading your portfolio…",
    dbErrorEyebrow: "Could not open the database",
    bootRetryHint:
      "Try again; if it keeps failing, quit and reopen the app, and keep the log file for diagnosis.",
    tryAgain: "Try again",
  },

  // Startup failures from the data layer (P5a), keyed by DataError code.
  // Engine input rules (D-17, D-27, D-36, D-37, D-42, D-54), shown when an import or a
  // restore is refused. Keyed by the engine's ValidationCode.
  inputRules: {
    INVALID_DATE: "Not a valid date",
    NON_FINITE_NUMBER: "Not a finite number",
    NEGATIVE_AMOUNT: "Must not be negative",
    NEGATIVE_PRINCIPAL: "The loan principal must not be negative",
    RATE_OUT_OF_RANGE: "Must be a fraction from zero to one",
    INSTALMENT_BELOW_INTEREST:
      "The monthly instalment does not cover the monthly interest, so the loan would never be repaid",
    ZERO_RATE_ZERO_INSTALMENT:
      "With a zero interest rate the instalment must be above zero",
    MISSING_TERM_FOR_DEV_LOAN:
      "A loan with draws or an interest-only period needs a loan term",
    NON_POSITIVE_DRAW: "Each draw must be above zero",
    DRAW_BEFORE_START:
      "A draw must be dated after the loan start; money drawn on the start date belongs in Drawn at start (the initial principal)",
    DRAW_AFTER_SCHEDULE_END:
      "A draw must be dated on or before the loan's last-but-one payment date (start date plus loan term, less one month)",
    COMPLETION_BEFORE_START:
      "The interest-only end date is before the loan start",
    DUPLICATE_BLOCK_START:
      "This property already has a mortgage starting on the same date",
    END_BEFORE_START: "The end date is before the start date",
    DUPLICATE_HOLDING_COST:
      "The property has more than one holding-costs record",
    ORPHAN_ROW: "The record belongs to a property that does not exist",
    HORIZON_NOT_POSITIVE: "The projection horizon must be at least one year",
    INVALID_TERM: "The term in years is not valid",
    SHOCK_OUT_OF_RANGE: "A scenario shock is outside its allowed range",
    GROWTH_OUT_OF_RANGE: "Must be above −100 %",
    SHOCKED_RATE_OUT_OF_RANGE:
      "The post-fixation reset rate plus the rate shock must stay between 0 % and 100 %",
    SHOCKED_INFLATION_OUT_OF_RANGE:
      "Inflation plus the inflation shock must stay above −100 %",
    ASOF_BEFORE_BASEDATE: "The date is before the base date",
    NON_POSITIVE_PREPAYMENT: "Each prepayment must be above zero",
    EVENT_BEFORE_START:
      "A prepayment or maturity change must be dated after the loan start",
    EVENT_AFTER_SCHEDULE_END:
      "A prepayment or maturity change must be dated before the loan's last payment",
    INVALID_RECAST:
      "A maturity change needs either a new maturity date or a new instalment above zero, not both",
    INVALID_RECAST_MATURITY:
      "The new maturity must be after the next payment and after a development loan's completion, and at most 50 years after the loan start (or the contract term, if longer)",
    RECAST_INSTALMENT_BEFORE_COMPLETION:
      "A new instalment can only be set after the interest-only period ends; set a new maturity date instead",
    LEASE_OVERLAP:
      "This lease overlaps another lease of the same property. Leases cannot overlap: end the earlier lease before the later one starts",
  } satisfies Record<ValidationCode, string>,

  // A write the database refused (P7a, DR-133). Shown in place of SQLite's raw text.
  writeErrors: {
    duplicatePropertyName: "A property with this name already exists",
    duplicateValuationDate:
      "This property already has a valuation from this date",
    duplicateLeaseStart:
      "This property already has a lease starting on this date",
    duplicateId:
      "A record with the same internal id already exists, so nothing was changed",
    invalidFlag: "A yes/no value is not valid",
    invalidJson: "A stored value could not be read",
    missingValue: "A required value is missing",
    otherConstraint: "The database refused the change, so nothing was changed",
    // ADR 0128 §6: an assumptions edit that would break a saved scenario.
    scenarioBreaks: (name: string, rule: string) =>
      `This value would break the scenario “${name}”. ${rule}. Change the value or edit the scenario first`,
  },

  dataErrors: {
    DB_INTEGRITY:
      "The database file failed its integrity check. Nothing was changed.",
    DB_NEWER:
      "This database was saved by a newer version of the app. Nothing was changed. Open it with that version.",
    MIGRATION_CONFLICT:
      "The database upgrade stopped before changing anything: some saved records conflict with the new data rules. Correct them in the previous app version, then open this version again.",
    MIGRATION_BACKUP_FAILED:
      "The database upgrade did not start because the safety backup could not be written or verified. Nothing was changed. Check that the disk has free space, then open the app again.",
    MIGRATION_FAILED:
      "The database upgrade failed and was rolled back. Nothing was changed; the previous app version still opens this database.",
    ROW_INVALID:
      "A saved record contains a value the app cannot read. Nothing was changed.",
    ROW_MISSING: "The record no longer exists. Nothing was changed.",
    SCENARIO_INVALID: "A saved scenario cannot be read. Nothing was changed.",
    detailsHeading: "Records involved",
    logHint:
      "Details are in the app log: ~/Library/Logs/com.bures.realestate-tracker/app.log",
  },

  // The startup error screen (#115, ADR 0153).
  boot: {
    partialConflict: (reached: number, stoppedAt: number) =>
      `The database upgrade stopped at version ${stoppedAt}: some saved records conflict with the new data rules. The steps before it went through, so the database is now at version ${reached}, and the previous app version no longer opens it.`,
    partialFailed: (reached: number, stoppedAt: number) =>
      `The database upgrade failed at version ${stoppedAt}, and that step was rolled back. The steps before it went through, so the database is now at version ${reached}, and the previous app version no longer opens it.`,
    copyAt: (file: string) =>
      `A copy from before the upgrade is in the backups folder: ${file}. To go back to the previous app version, quit the app, move portfolio.db, portfolio.db-wal and portfolio.db-shm aside (some may not exist), and put a copy of that file in its place, renamed portfolio.db.`,
    partialNew: (reached: number, stoppedAt: number) =>
      `Setting up the new database stopped at version ${stoppedAt}; it is at version ${reached} and holds no data yet. Try again.`,
    nextIntegrity:
      "Quit the app and move portfolio.db, portfolio.db-wal and portfolio.db-shm out of the data folder (do not delete them; some may not exist). Then either reopen the app, which starts with a new database holding the sample portfolio, and restore your latest JSON backup in Settings → Backup & Restore; or, before you reopen it, put a copy of a pre-migration file from the backups folder in the data folder, renamed portfolio.db.",
    nextRowInvalid:
      "Restore a backup… replaces all data with a JSON backup; a safety copy of the current data is saved first. Or report the record below.",
    restoreBackup: "Restore a backup…",
    restoredReloadFailed: (file: string) =>
      `The backup was restored and your previous data was saved as ${file} in the backups folder, but the data could not be loaded. Try again; if it keeps failing, keep the log file for diagnosis.`,
    continue: "Open the app",
    detailsOther: "Details",
    showDataFolder: "Show data folder",
    revealFailed:
      "Could not open the folder. It is at ~/Library/Application Support/com.bures.realestate-tracker/",
  },

  errorBoundary: {
    title: "Something went wrong on this screen",
    tryAgain: "Try again",
    // Stored data that breaks an engine rule (UX-049)
    invalidDataTitle: "Some saved data breaks a rule the calculations need",
    invalidDataBody:
      "Correct the record below; the numbers on this screen come back once it is valid.",
    openProperty: "Open property",
    assumptionsRecord: "Assumptions",
    unknownRecord: "A record",
  },

  // Short month names for the on-screen projection Period column. (Excel export +
  // format.ts keep English months, which format.test.ts pins.)
  monthsShort: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],

  // Calendar popover (DateInput). weekdaysShort indexed by JS getDay() (0 = Sunday).
  // weekStartsOn: 0 = Sunday (EN), 1 = Monday (CS/RU).
  calendar: {
    open: "Open calendar",
    weekStartsOn: 0,
    weekdaysShort: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  },

  nav: {
    dashboard: "Dashboard",
    properties: "Properties",
    projections: "Projections",
    scenarios: "Scenarios",
    guide: "Guide",
    importData: "Import",
    settings: "Settings",
  },

  // Native macOS menu items the app adds (UX-076); View ▸ pages reuse `nav`.
  menu: {
    about: `About ${APP_NAME}`,
    settings: "Settings…",
    newProperty: "New Property…",
  },

  // Chart cards: the toggle that shows a chart as a table (UX-075).
  charts: {
    table: "Table",
    surfaceLabel: (title: string) =>
      `${title} — chart. Use the Table button for the values.`,
  },

  shell: {
    offline: "Offline · local-first",
    skipToContent: "Skip to content",
    backupHintNone: "No backup yet. Export now",
    backupHintOld: (days: number) =>
      `Last backup ${days} ${enPlural(days, ["day", "days"])} ago. Export now`,
    dismissBackupHint: "Hide the backup reminder",
    baseDate: (d: string) => `Projection start ${d}`,
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    appearance: "Appearance",
    nominalOrReal: "Nominal or Real terms",
    language: "Language",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    themeTitle: (cur: string, next: string) =>
      `Theme: ${cur} — click for ${next}`,
    themeAria: (cur: string, next: string) =>
      `Theme: ${cur}. Switch to ${next}`,
  },

  dashboard: {
    title: "Dashboard",
    subtitleDefault: "Portfolio overview",
    subFilter: (n: number, total: number) => `${n} of ${total} properties`,
    asOf: (d: string) => `as of ${d}`,
    netWorth: "Net worth",
    netWorthInYear: (endYear: number, n: number) =>
      `Net worth in ${endYear} (${n}-yr horizon)`,
    assetsDebtEquity: (assets: string, debt: string) =>
      `Assets ${assets} · Debt ${debt} · Equity in Kč`,
    realTodayKc: " · real (base-date Kč)",
    multipleFromStartMode: (mult: string, mode: string) =>
      `${mult} from projection start · ${mode}`,
    leveredIrr: "Levered IRR",
    irrFoot: (n: number, mode: string) => `${n}-yr · after debt · ${mode}`,
    portfolioLtv: "Portfolio LTV",
    badgeConservative: "Conservative",
    badgeModerate: "Moderate",
    badgeHigh: "High",
    debtOverValue: "Debt ÷ value",
    portfolioDscr: "Portfolio DSCR",
    badgeCoversDebt: "Covers debt",
    badgeShortfall: "Shortfall",
    noiOverDebtService: "NOI ÷ debt service",
    netYieldCap: "Net yield (cap rate)",
    grossYieldFoot: (v: string) => `Gross yield ${v}`,
    annualNetCashFlow: "Annual net cash flow",
    noiMinusDebtService: "NOI − debt service, current",
    noiMinusDebtServiceYear: (year: string) =>
      `NOI − debt service, projection year ${year}`,
    noiMinusDebtServiceOn: (d: string) => `NOI − debt service, on ${d}`,
    currentMonthlyCashFlow: "Current monthly cash flow",
    monthlyCashFlowOn: (d: string) => `Monthly cash flow on ${d}`,
    monthlyEquivalentYear: (year: string, period: string) =>
      `Monthly equivalent — projection year ${year} (${period})`,
    monthlyHint: (d: string) =>
      `annualised run rate ÷ 12, leases in force on ${d}`,
    monthlyHintProjection: "annual projection ÷ 12",
    inflowLabel: "Inflow · effective rent",
    outflowLabel: "Outflow · costs + debt service",
    netCashFlowBaseline: "Net cash flow · baseline",
    trajectory: (n: number) => `${n}-year trajectory`,
    realTerms: "Real terms (base-date Kč)",
    nominalKc: "Nominal Kč",
    chartValueVsDebtVsEquity: "Value vs debt vs equity",
    chartEquityChange: "Equity change by year",
    subEquityChange: "appreciation, purchases and debt",
    chartNetCashFlowByYear: "Net cash flow by year",
    chartRentGrossVsEffective: "Rent — gross vs effective",
    chartNoiVsDebtService: "NOI vs debt service",
    chartLoanToValue: "Loan-to-value",
    subNetCashFlow: "green positive, red negative",
    subLtv: "% — falls as debt amortizes",
    seriesValue: "Value",
    seriesDebt: "Debt",
    seriesCommittedDebt: "Committed debt (incl. undrawn)",
    seriesEquity: "Equity",
    seriesAppreciation: "Appreciation",
    seriesPurchases: "Purchases",
    seriesDebtPaydown: "Debt repayment",
    seriesDebtDrawn: "Debt drawn",
    seriesNetEquityChange: "Net change",
    seriesGross: "Gross",
    seriesEffective: "Effective",
    seriesNoi: "NOI",
    seriesDebtService: "Debt service",
    seriesNetCashFlow: "Net cash flow",
    seriesLtv: "LTV",
    kpiTitle: "Key performance indicators",
    kpiHintNominal: "nominal terms",
    kpiHintReal: "real terms (base-date Kč)",
    kpiNetWorthAtHorizon: "Net worth at horizon",
    kpiNetWorthMultiple: "Net-worth multiple",
    kpiNetWorthCagr: "Net-worth CAGR",
    kpiLeveredIrr: "Levered IRR",
    kpiCumulativeCashToOwner: (n: number) =>
      `Cumulative cash to owner (Yrs 1–${n})`,
    kpiFirstCfPositiveYear: "First cash-flow-positive year",
    kpiDebtFullyRepaid: "Debt fully repaid",
    kpiSumPrincipalRepaid: (n: number) => `Σ principal repaid (Yrs 1–${n})`,
    kpiSumPrincipalRepaidNominal: (n: number) =>
      `Σ principal repaid (Yrs 1–${n}, nominal)`,
    kpiWeightedAvgRate: "Weighted-avg interest rate",
    kpiCashInvested: "Cash invested",
    kpiCashInvestedNominal: "Cash invested (nominal)",
    // Financing & upcoming panel (ADR 0103).
    financingTitle: "Financing & upcoming",
    financingHint: (d: string) => `modelled dates, as of ${d}`,
    financingNextReset: "Next rate reset",
    financingNextResetNone: "None ahead",
    financingBalanceAtReset: "Debt at that reset",
    financingBalanceAtResetNominal: "Debt at that reset (nominal)",
    financingResettingWithin: (n: number) =>
      `Debt resetting within ${n} ${enPlural(n, ["year", "years"])}`,
    financingResettingWithinNominal: (n: number) =>
      `Debt resetting within ${n} ${enPlural(n, ["year", "years"])} (nominal)`,
    financingLoans: (n: number) => `${n} ${enPlural(n, ["loan", "loans"])}`,
    financingWindow: "Reset window",
    financingWindowOption: (n: number) => `${n} y`,
    financingTotalInterest: (n: number) => `Total interest (Yrs 1–${n})`,
    financingTotalInterestReal: (n: number) =>
      `Total interest (Yrs 1–${n}, real)`,
    financingInterestSaved:
      "Interest saved by prepayments over the loans' remaining life (nominal)",
    financingInterestSavedByProperty: "By property",
    financingInterestSavedNa: "n/a: a recast depends on the prepayment",
    financingUpcoming: "Next 12 months",
    financingNoEvents: "Nothing modelled in the next 12 months.",
    financingMoreEvents: (n: number) => `+ ${n} more`,
    financingNoLoans: "No mortgage in this selection.",
    financingEventFixationEnd: "Fixation ends",
    financingEventLoanPayoff: "Loan repaid",
    financingEventDevCompletion: "Interest-only ends (completion)",
    financingEventLeaseEnd: "Lease ends, no next lease entered",
    financingDisclaimer:
      "Dates are modelled from the loans and leases you entered. They are not deadlines from your lender; check exact dates with your bank.",
  },

  // Data check (ADR 0118).
  dataCheck: {
    title: "Data check",
    summary: (attention: number, defaults: number) =>
      `${attention} to review · ${defaults} on portfolio defaults`,
    attentionTitle: "Needs attention",
    attentionNone: "Nothing needs attention.",
    defaultsTitle: "Using portfolio defaults",
    asOfNote: (date: string) => `Checked as of ${date}.`,
    show: "Show data check",
    hide: "Hide data check",
    goTo: (section: string) => `Go to ${section}`,
    valuationStale: (age: string, date: string) =>
      `The valuation in use is ${age} old (${date}). Value, equity and LTV rest on it.`,
    noValuation: (price: string) =>
      `No valuation is recorded, so the purchase price of ${price} stands in as the market value.`,
    noLease: (date: string) =>
      `No lease is in force on ${date}, so rent counts as 0.`,
    leaseEnded: (date: string) =>
      `The lease ended on ${date} and no next lease is entered. The snapshot counts no rent after that date; the projection assumes the lease is renewed.`,
    leaseEnding: (date: string) =>
      `The lease ends on ${date} and no next lease is entered. The projection assumes it is renewed.`,
    growthBoth: "Uses the portfolio appreciation and rent indexation.",
    growthAppreciation: "Uses the portfolio appreciation.",
    growthRentIndexation: "Uses the portfolio rent indexation.",
    costDefaults: (fields: string) =>
      `Holding costs use the portfolio defaults for: ${fields}.`,
    fundingUnknown:
      "Own cash paid at purchase is not recorded, so Cash invested is not known.",
    fundingUnknownFuture:
      "Own cash for this purchase is not recorded, so Cash invested is not known and the projection derives the down payment: the price less the loan, plus any recorded costs and works.",
    recordFunding: "Record funding",
    // Stored values outside the form ranges (ADR 0148).
    outOfRangeSize: (value: string, range: string) =>
      `Size ${value} m² is outside the range the forms accept (${range} m²).`,
    outOfRangeFixation: (date: string, value: string, range: string) =>
      `Mortgage from ${date}: a fixation of ${value} years is outside the range the forms accept (${range} years).`,
    outOfRangeTerm: (date: string, value: string, range: string) =>
      `Mortgage from ${date}: a loan term of ${value} years is outside the range the forms accept (${range} years).`,
    outOfRangeHorizon: (value: string, range: string) =>
      `The projection horizon of ${value} years is outside the range the forms accept (${range} years).`,
    // ADR 0149: a stored date before the forms' floor; `record` from earlyDateRecord.
    earlyDate: (record: string, date: string, floor: string) =>
      `${record} ${date} is before ${floor}, the earliest date the forms accept. Check the year for a typo.`,
    // ADR 0163: two stored leases of one apartment overlap (a database from before the rule).
    leaseOverlap: (first: string, second: string) =>
      `The leases from ${first} and from ${second} overlap. Leases on one apartment cannot overlap: set an end date on the earlier lease before the later one starts.`,
    earlyDateRecord: {
      property: "Purchase date",
      mortgage: "A mortgage date",
      valuation: "A valuation date",
      lease: "A lease date",
      assumptions: "The base date",
    },
    assumptions: "Assumptions",
  },

  properties: {
    title: "Properties",
    subtitle: (n: number) => `${n} ${enPlural(n, ["apartment", "apartments"])}`,
    asOf: (d: string) => `as of ${d}`,
    asOfProjection: (d: string, year: string, period: string) =>
      `as of ${d} (projection year ${year}, ${period})`,
    unitsNote: "amounts in Kč, flows per year",
    addProperty: "Add property",
    emptyTitle: "No properties",
    emptyBody: "Add your first property, or import your data from CSV files.",
    colProperty: "Property",
    colValue: "Value",
    colDebt: "Debt",
    colEquity: "Equity",
    colLtv: "LTV",
    colNoi: "NOI",
    colNetCashFlow: "Net cash flow",
    colDscr: "DSCR",
    badgePending: "Pending",
    pendingPurchaseOn: (d: string) => `purchase ${d}`,
    badgeInactive: "Inactive",
    editProperty: "Edit property",
    deleteProperty: "Delete property",
    confirmDelete: (name: string) =>
      `Delete ${name} and all linked mortgages, valuations, leases, and holding costs? This cannot be undone.`,
  },

  propertyDetail: {
    fallbackTitle: "Property",
    noneSelectedTitle: "No property selected",
    backToProperties: "Back to properties",
    allProperties: "‹ All properties",
    purchased: (d: string) => `purchased ${d}`,
    pendingPurchase: (d: string) => `pending — purchase ${d}`,
    notOwnedTitle: "Not owned yet",
    notOwnedHint:
      "Its figures start once it is bought; until then the charts show 0.",
    asOf: (d: string) => `as of ${d}`,
    deactivated: "deactivated",
    deactivate: "Deactivate",
    deactivating: "Deactivating…",
    yesDeactivate: "Yes, deactivate",
    activate: "Activate",
    activating: "Activating…",
    deactivateTitle: "Exclude this property from dashboards and projections",
    activateTitle: "Include this property in dashboards and projections again",
    confirmDeactivate: (name: string) =>
      `Deactivate ${name}? It will be excluded from dashboards and projections until reactivated. No data is deleted. Deactivating does not record a sale, sale proceeds or a loan payoff.`,
    confirmDeleteValuation: (date: string) =>
      `Delete the valuation from ${date}?`,
    confirmDeleteLease: (date: string) => `Delete the lease from ${date}?`,
    confirmDeleteMortgage: (date: string) =>
      `Delete the mortgage block from ${date}?`,
    inactiveBadge: "Inactive",
    inactiveNote:
      "This property is excluded from portfolio dashboards and projections.",
    inactivePreviewNote:
      "The figures below show it as if it were still active.",
    sizeM2: (n: number) => `${n} m²`,
    marketValue: "Market value",
    debt: "Debt",
    equity: "Equity",
    dscr: "DSCR",
    ltv: "LTV",
    netCf: "Net CF",
    chartValueVsDebtVsEquity: "Value vs debt vs equity",
    chartNetCashFlowByYear: "Net cash flow by year",
    subMKcMode: (mode: string) => mode,
    seriesValue: "Value",
    seriesDebt: "Debt",
    seriesCommittedDebt: "Committed debt (incl. undrawn)",
    seriesEquity: "Equity",
    seriesNetCashFlow: "Net cash flow",
    // Entity panels
    valuationsTitle: "Valuations",
    valuationsHint:
      "effective-dated market values — for a development property this is the completed (target) value; while the loan is drawing, the value shown is the completed value less the tranches not drawn yet",
    addValuation: "valuation",
    colValidFrom: "Valid from",
    colValidTo: "Valid to",
    colMarketValue: "Market value",
    leasesTitle: "Leases",
    leasesHint:
      "the lease in force on the As-of date sets the rent shown; a new lease ends the open one before it on the previous day",
    addLease: "lease",
    colStart: "Start",
    colEnd: "End",
    colMonthlyRent: "Monthly rent",
    mortgagesTitle: "Mortgage blocks",
    mortgagesHint: "fixation end resets the rate and re-amortizes",
    addMortgage: "mortgage block",
    colInitialPrincipal: "Initial principal",
    colFixation: "Fixation",
    colTerm: "Term",
    colRate: "Rate",
    colInstalment: "Instalment",
    colDevelopment: "Development",
    yrs: (n: number) => `${n} ${enPlural(n, ["yr", "yrs"])}`,
    auto: "auto",
    tranches: (n: number) => `${n} ${enPlural(n, ["tranche", "tranches"])}`,
    totalLoan: (total: string) => `Total loan ${total}`,
    ioUntil: (d: string) => `IO→${d}`,
    // ADR 0099: adding a valuation/lease offers to end the open-ended previous one.
    closePrevValuationTitle: "End the previous valuation?",
    closePrevValuationBody: (from: string, end: string) =>
      `The valuation from ${from} has no end date. End it on ${end}, the day before the new one starts?`,
    closePrevConfirm: "End previous",
    closePrevKeep: "Keep as is",
    // Mortgage form hints and the instalment "Calc" button (DR-059)
    instalmentHint: (years: string, amount: string) =>
      `Amortizing instalment over ${years} ≈ ${amount}`,
    instalmentHintDev: (base: string) =>
      `${base} — for the amount drawn at start; re-amortizes at each draw and at completion. Loan term is required.`,
    devTermNeeded:
      "Development loan — set an explicit loan term (years); it is required for draws / interest-only.",
    calc: "Calc",
    calcTitle: (years: string) => `Calculate instalment over ${years}`,
    calcDisabled: "Enter principal and interest rate first",
    // Field labels (entity forms)
    fieldValidFrom: "Valid from",
    fieldValidTo: "Valid to",
    fieldMarketValue: "Market value",
    fieldStartDate: "Start date",
    fieldEndDate: "End date",
    fieldMonthlyRent: "Monthly rent",
    fieldInitialPrincipal: "Initial principal",
    fieldFixationYears: "Fixation (years)",
    fieldLoanTermYears: "Loan term (years)",
    helpLoanTermYears:
      "blank = infer from instalment; required for development loans",
    fieldInterestRate: "Interest rate p.a.",
    fieldMonthlyInstalment: "Monthly instalment",
    fieldDraws: "Drawdown schedule",
    helpDraws:
      "How the bank pays the loan out. The first row is the amount drawn on the start date; add a row for each later tranche. The whole loan counts as debt from the start; interest is charged only on what is drawn.",
    drawnAtStart: "Drawn at start",
    drawnAtStartNoDate: "on the start date",
    trancheRow: (n: number) => `Tranche ${n}`,
    addTranche: "Add tranche",
    drawdownTotal: (total: string, n: number) =>
      `Total loan ${total} · ${n} ${enPlural(n, ["tranche", "tranches"])} after start`,
    warnAfterCompletion:
      "Drawn after the interest-only period ends; the loan re-amortizes again at this draw",
    warnSameDate:
      "Same date as another tranche; the amounts are added together",
    fieldCompletionDate: "Interest-only until (completion)",
    helpCompletionDate: "pay interest only until this date, then re-amortize",
    // Loan type switch and successor note (ADR 0098)
    loanType: "Loan type",
    loanTypeStandard: "Standard",
    loanTypeDevelopment: "Development (construction)",
    loanTypeClearWarning: "Standard clears the draws and the completion date.",
    loanTypeClearAndSwitch: "Clear and switch",
    loanTypeKeepDevelopment: "Keep development",
    successorNote:
      "A new block replaces the current one from its start date (refix or refinance). The app models one active loan per property.",
    successorLearnMore: "Learn more",
    // Holding costs
    holdingCostsTitle: "Holding costs",
    holdingCostsHint: "leave blank to use the global default",
    fieldPropertyTax: "Property tax /yr",
    fieldInsurance: "Insurance /yr",
    fieldSvjMo: "SVJ /mo",
    fieldOther: "Other /yr",
    fieldMgmtPct: "Management (% rent)",
    fieldMaintPct: "Maintenance (% rent)",
    saveHoldingCosts: "Save holding costs",
    holdingCostsSaved: "Holding costs saved",
    // Projection + amortization
    projectionTitle: (n: number) => `${n}-year projection`,
    amortizationWarn:
      "The monthly instalment will not repay this loan by the end of its term.",
    eventIssue: {
      PREPAYMENT_EXCEEDS_BALANCE: (
        date: string,
        requested: string,
        applied: string,
      ) =>
        `the prepayment of ${requested} on ${date} is more than the balance: it repays ${applied} and pays the loan off.`,
      PREPAYMENT_AFTER_PAYOFF: (date: string) =>
        `the prepayment on ${date} falls after the loan is paid off, so it is ignored.`,
      PREPAYMENT_REPLACED: (date: string) =>
        `the prepayment on ${date} falls after the next loan block takes over, so it is ignored.`,
      RECAST_AFTER_PAYOFF: (date: string) =>
        `the maturity change on ${date} falls after the loan is paid off, so it is ignored.`,
      RECAST_REPLACED: (date: string) =>
        `the maturity change on ${date} falls after the next loan block takes over, so it is ignored.`,
      RECAST_INSTALMENT_BELOW_INTEREST: (date: string) =>
        `the new instalment from ${date} does not cover the interest, so the loan keeps its terms.`,
      RECAST_TERM_CAPPED: (date: string) =>
        `the new instalment from ${date} would run past the longest allowed term, so the loan is re-amortized to that term instead.`,
    } satisfies Record<
      LoanEventIssue,
      (date: string, requested: string, applied: string) => string
    >,
    drawdownTitle: "Drawdown",
    drawdownTitleFrom: (date: string) => `Drawdown · from ${date}`,
    drawdownProgress: (drawn: string, total: string, pct: string) =>
      `Drawn ${drawn} of ${total} (${pct})`,
    drawdownFull: (total: string) => `Fully drawn: ${total}`,
    drawdownIoEnd: (date: string) => `Interest-only until ${date}`,
    drawdownNote:
      "A draw counts as drawn once its date is on or before the as-of date; the debt figures count it from the next payment date. The whole loan counts as debt from the start; interest is due only on what is drawn.",
    drawdownTable: "Each draw",
    colDraw: "Draw",
    drawStatus: {
      drawn: "Drawn",
      ahead: "Not drawn yet",
      cancelled: "Not drawn — replaced",
    },
    loanSummaryTitle: "Loan outlook",
    loanSummaryHint: "modelled from your loans, prepayments and recasts",
    loanPayoff: "Modelled payoff",
    loanPayoffNone: "Repaid",
    interestSaved: "Interest saved by prepayments (nominal)",
    interestSavedNa: "n/a: a recast depends on the prepayment",
    // ADR 0117: the remaining term and each block's reset.
    remainingTerm: "Remaining term",
    outlookResetsTitle: "Fixation resets by loan block",
    colFixationEnd: "Fixation end",
    colBalanceAtReset: "Debt at reset (nominal)",
    colStatus: "Status",
    outlookStatus: {
      nextReset: "Next rate reset",
      upcoming: "Upcoming",
      passed: "Passed",
      replaced: "Replaced by a later loan",
      repaid: "Repaid before the reset",
      floating: "Floating rate",
    },
    loanSummaryNote:
      "The payoff and fixation dates are modelled, not deadlines from your lender, and balances at reset are nominal. Interest saved compares the loan with and without every prepayment, over its whole remaining life.",
    loanFrom: (date: string) => `Loan from ${date}:`,
    monthsCount: (n: number) => `${n} ${enPlural(n, ["month", "months"])}`,
    maturityPaysOff: (instalment: string, implied: string) =>
      `The instalment of ${instalment} pays it off on ${implied},`,
    maturityAfter: (months: string, contract: string) =>
      `${months} after the contract maturity ${contract}.`,
    maturityBefore: (months: string, contract: string) =>
      `${months} before the contract maturity ${contract}.`,
    maturityCheck: "Check the instalment or the maturity date.",
    fixationEnded: (end: string, rate: string) =>
      `Its fixation ended on ${end} and no follow-on block is entered, so the app assumes the reset rate of ${rate} from then on. Add the refix terms as a new mortgage block.`,
    fixationEndedUntil: (end: string, until: string, rate: string) =>
      `Its fixation ended on ${end} and the next block starts only on ${until}, so the app assumes the reset rate of ${rate} from ${end} until ${until}. Add the terms for those months as a mortgage block.`,
    fieldPrepayments: "Prepayments",
    helpPrepayments:
      "Extra repayments of principal on a date. Lowering the instalment keeps the term; shortening the term keeps the instalment. The fee is paid in cash and does not reduce the debt.",
    fieldRecasts: "Maturity changes",
    helpRecasts:
      "From a date, the loan runs to a new maturity date or at a new instalment.",
    eventDate: "Date",
    eventAmount: "Amount",
    eventEffect: "Effect",
    eventEffectLowerInstalment: "Lower the instalment",
    eventEffectShortenTerm: "Shorten the term",
    eventFee: "Fee (optional)",
    eventMode: "Change",
    eventModeMaturity: "New maturity date",
    eventModeInstalment: "New instalment",
    eventMaturity: "Maturity date",
    eventInstalment: "Instalment",
    eventAddPrepayment: "Add prepayment",
    eventAddRecast: "Add maturity change",
    eventPrepaymentRow: (n: number) => `Prepayment ${n}`,
    eventRecastRow: (n: number) => `Maturity change ${n}`,
    eventRemove: (row: string) => `Remove ${row}`,
    fieldContractMaturity: "Contract maturity date",
    helpContractMaturity:
      "from the loan contract; blank = not checked; not used for development loans",
    amortizationWarnExpected: "Expected instalment ≈",
    // Section nav (ADR 0107)
    sectionNavLabel: "Property sections",
    sectionOverview: "Overview",
    sectionRecords: "Records",
    sectionFinancing: "Financing",
    sectionHolding: "Holding costs",
    sectionProjection: "Projection",
    sectionAmortization: "Amortization",
    // Acquisition section (ADR 0119 §9)
    sectionAcquisition: "Acquisition",
    acqTitle: "Acquisition funding",
    acqHint: "as recorded, nominal",
    acqPrice: "Purchase price",
    acqTransactionCosts: "Transaction costs",
    acqInitialWorks: "Initial works",
    acqUses: "Uses (price + costs + works)",
    acqCashInvested: "Cash invested (own cash)",
    acqLoan: "Acquisition loan",
    acqLoanNone: "None",
    acqSources: "Sources (own cash + loan)",
    acqGapShort: (amount: string) =>
      `The recorded sources fall ${amount} short of the uses. Check the own cash, the costs and works, or the loan.`,
    acqGapOver: (amount: string) =>
      `The recorded sources exceed the uses by ${amount}. Check the own cash, the costs and works, or the loan.`,
    acqNote:
      "— means not recorded; the uses count only the recorded costs and works. The acquisition loan is the first loan block when it starts no later than 90 days after the purchase, or a development loan whatever its start. Set the amounts in Edit property.",
    acqRecordedNote: (note: string) => `Note: ${note}`,
    showAmortization: (n: number) =>
      `Show amortization schedule (${n} ${enPlural(n, ["payment", "payments"])})`,
    hideAmortization: "Hide amortization schedule",
    amortizationTitle: "Amortization schedule",
    amortizationMonths: (n: number) =>
      `${n} ${enPlural(n, ["month", "months"])}`,
    amColMonth: "Month",
    amColDate: "Due date",
    amColRate: "Rate",
    amColInstalment: "Instalment",
    amColInterest: "Interest",
    amColPrincipal: "Principal",
    amColDrawn: "Drawn",
    amColRefinanced: "Refinance difference",
    amColPrepaid: "Prepaid",
    amColPrepaymentFee: "Prepayment fee",
    amColEndBalance: "End balance",
  },

  assumptions: {
    scenariosHint:
      "These are the base values used across all screens. Override them per what-if run in Scenarios.",
    saved: "Assumptions saved — projections updated",
    driversTitle: "Market & projection drivers",
    defaultsTitle: "Holding-cost defaults",
    defaultsHint: "used when a property leaves a field blank",
    baseDate: "Base date",
    baseDateHelp:
      "Projection start (year 0) and the price base for real terms. Current figures follow the As-of date, today by default.",
    horizon: "Horizon",
    appreciation: "Appreciation p.a.",
    rentIndexation: "Rent indexation p.a.",
    inflation: "Inflation (CPI) p.a.",
    vacancy: "Vacancy allowance",
    postFixationReset: "Post-fixation reset rate",
    propertyTax: "Property tax /yr",
    insurance: "Insurance /yr",
    svj: "SVJ / fond oprav /mo",
    other: "Other /yr",
    mgmt: "Management (% rent)",
    maint: "Maintenance (% rent)",
  },

  settings: {
    title: "Settings",
    subtitle: "Assumptions and data backup",
    tabs: {
      assumptions: "Assumptions",
      backup: "Backup & Restore",
    },
  },

  projections: {
    title: "Projections",
    subtitle: (lens: string) => `Year-by-year · ${lens}`,
    realTerms: "real terms",
    realTermsDated: (d: string) => `real terms (Kč at projection start ${d})`,
    nominalKc: "nominal Kč",
    periodNote: "flows per year, balances at year end",
    portfolio: "Portfolio",
    entity: "Entity",
  },

  scenarios: {
    plusPp: (n: number) => `+${n}pp`,
    title: "Scenarios",
    subtitle: "What-if overrides on assumptions — Base is your saved portfolio",
    newScenario: "New scenario",
    base: "Base",
    savedAssumptions: "saved assumptions",
    noOverrides: "no overrides",
    presetsTitle: "Stress presets",
    presetsHint: (years: number) =>
      `One click saves a scenario. Rate and inflation shocks last ${years} years, then revert; a price crash is permanent.`,
    showPresets: "Show presets",
    hidePresets: "Hide presets",
    presetsCollapsedSummary:
      "Rate, inflation, price-crash and combined shocks are hidden.",
    atStart: "Start",
    atStartTitle: (date: string) => `At projection start (${date})`,
    rateShockAtRefix: "Rate shock @ refix",
    inflationShock: "Inflation shock",
    priceCrash: "Price crash",
    crashWhen: "When",
    rateForYears: (label: string, years: number) =>
      `Rates ${label} for ${years}y`,
    inflForYears: (label: string, years: number) =>
      `Inflation ${label} for ${years}y`,
    crashTitle: (label: string, suffix: string) =>
      `Price crash ${label}${suffix}`,
    crashAt: (label: string) => ` @ ${label}`,
    combined: "Combined",
    mild: "Mild",
    severe: "Severe",
    combinedTitle: (level: string, parts: string) => `${level}: ${parts}`,
    addedScenario: (name: string) => `Added “${name}”`,
    duplicatedScenario: (name: string) => `Duplicated “${name}”`,
    alreadySaved: (name: string) => `Already saved: “${name}”`,
    addedCompareFull: (name: string, max: number) =>
      `Added “${name}”. Compare already shows ${max} scenarios, so untick one to add it.`,
    duplicatedCompareFull: (name: string, max: number) =>
      `Duplicated “${name}”. Compare already shows ${max} scenarios, so untick one to add the copy.`,
    confirmDelete: (name: string) =>
      `Delete scenario “${name}”? This cannot be undone.`,
    deletedScenario: (name: string) => `Deleted “${name}”`,
    listTitle: "Scenarios",
    listHint: (max: number) =>
      `Tick up to ${max} scenarios to compare. Base is extra and does not count.`,
    duplicate: "Duplicate",
    emptyList: "No saved scenarios yet — use a preset or “New scenario”.",
    compareTitle: "Compare",
    nothingSelectedTitle: "Nothing selected",
    nothingSelectedBody: "Tick Base and/or scenarios above to compare.",
    keyFiguresTitle: "Key figures",
    keyFiguresHint: "nominal Kč",
    keyFiguresHintReal: "real terms (base-date prices)",
    chartNetWorth: "Net worth (equity)",
    chartNetCashFlow: "Net cash flow by year",
    chartLtv: "Loan-to-value",
    subPct: "%",
    kpiStartingEquity: "Starting equity",
    kpiNetWorthDeltaVsBase: "Δ net worth vs Base",
    viewValues: "Values",
    viewDeltaVsBase: "Δ vs Base",
    viewToggleLabel: "Show values or the difference to Base",
    deltaYears: (n: number) => (n > 0 ? `+${n}y` : n < 0 ? `−${-n}y` : "0y"),
    deltaNoBaseValue: "Base has no value",
    rebasedReturnsFootnote: (names: string) =>
      `Returns for ${names} are measured from a lower starting equity after the price crash; compare Δ net worth vs Base for the loss to you.`,
    kpiNetWorthNominal: "Net worth (nominal)",
    kpiNetWorthReal: "Net worth (real)",
    kpiNetWorthMultiple: "Net-worth multiple",
    kpiCagrNominal: "CAGR (nominal)",
    kpiCagrReal: "CAGR (real)",
    kpiCumulativeCashToOwner: "Cumulative cash to owner",
    kpiLeveredIrrNominal: "Levered IRR (nominal)",
    kpiLeveredIrrReal: "Levered IRR (real)",
    kpiFirstCfPositiveYear: "First CF-positive year",
    kpiDebtFreeYear: "Debt-free year",
    // Summary fragments
    sumAppreciation: (v: string) => `appreciation ${v}`,
    sumRentIndex: (v: string) => `rent index ${v}`,
    sumVacancy: (v: string) => `vacancy ${v}`,
    sumResetRate: (v: string) => `reset rate ${v}`,
    sumInflation: (v: string) => `inflation ${v}`,
    sumInflationShock: (v: string, years: number) =>
      `inflation +${v} pp for ${years}y`,
    sumRateShock: (v: string, years: number) => `rates +${v} pp for ${years}y`,
    // Which loans a rate shock reaches (ADR 0100)
    reachHits: (n: number, m: number, years: string) =>
      `hits ${n} of ${m} ${enPlural(m, ["loan", "loans"])} (refix ${years})`,
    reachNone: "no loan refixes inside the shock window, so no effect",
    // A saved scenario that breaks an engine rule, or cannot be read (ADR 0123)
    unreadableRow:
      "Cannot be read, so it is left out. Delete it before you export: a backup that contains it cannot be restored.",
    notCompared: (name: string) =>
      `Left out of the comparison: “${name}” has a value outside its allowed range. Edit or delete it in the list.`,
    sumValueShock: (v: string, atYear: number) =>
      `value −${v}${atYear ? ` @ yr${atYear}` : ""}`,
    // Form
    editTitle: (name: string) => `Edit “${name}”`,
    newTitle: "New scenario",
    formHint: "blank = inherit Base",
    name: "Name",
    namePlaceholder: "e.g. Recession",
    inherit: "inherit",
    baseValue: (v: string) => `Base ${v}`,
    fieldAppreciation: "Appreciation p.a.",
    fieldRentIndexation: "Rent indexation p.a.",
    fieldVacancy: "Vacancy allowance",
    fieldPostFixationReset: "Post-fixation reset rate",
    fieldInflation: "Inflation p.a.",
    fieldInflationShock: "Inflation shock",
    fieldRateShock: "Rate shock at refix",
    fieldValueCrash: "Value crash",
    forYears: "…for years",
    atYear: "…at year",
    ppSuffix: "pp",
    shockHelp:
      "Temporary, then reverts. Adds percentage points: +2 pp turns 4.5 % into 6.5 %.",
    rateShockHelp:
      "Starts at each loan's fixation end (a floating loan: Today), then reverts. Adds percentage points: +2 pp turns 4.5 % into 6.5 %.",
    permanentCorrection: "permanent correction",
    // Form groups (ADR 0102)
    groupLevels: "Permanent levels",
    groupLevelsHelp:
      "Replace the Base value for the whole projection. A property with its own growth rate keeps it.",
    groupShocks: "Temporary shocks",
    groupShocksHelp:
      "Added on top of the level for a number of years, then back to trend.",
    groupCrash: "One-off price crash",
    groupCrashHelp:
      "Cuts all property values once, at the chosen year; growth resumes from the lower value. Enter the drop as a positive number: 20 = values fall by 20 %.",
    defaultYears: (n: number) => `default ${n}`,
    zeroIsStart: (date: string) => `0 = projection start (${date})`,
    none: "none",
  },

  importPage: {
    title: "Import",
    subtitle: "Import portfolio data from CSV files",
    propertiesTitle: "Properties",
    valuationsTitle: "Valuations",
    rentsTitle: "Rents / Leases",
    mortgagesTitle: "Mortgages",
    chooseFile: "Choose file…",
    dropHint: "or drag & drop a CSV file here",
    reupload: (name: string) => `Re-upload ${name}`,
    downloadTemplate: "Download template",
    rowsReady: (n: number) => `${n} ${enPlural(n, ["row", "rows"])} ready`,
    errorsBadge: (n: number) => `${n} ${enPlural(n, ["error", "errors"])}`,
    colRow: "Row",
    colField: "Field",
    colError: "Error",
    importTitle: "Import",
    fixErrors: "Fix all errors above before importing.",
    importSelected: "Import selected files",
    importing: "Importing…",
    importComplete: "Import complete",
    reportTitle: "Import report",
    willAdd: (n: number) => `Will add ${n}`,
    willUpdate: (n: number) => `Will update ${n}`,
    added: (n: number) => `Added ${n}`,
    updated: (n: number) => `Updated ${n}`,
    unchangedCount: (n: number) => `${n} unchanged`,
    importScope: (total: number, added: number, updated: number) =>
      `Import ${total} ${enPlural(total, ["record", "records"])} (${added} new, ${updated} ${enPlural(updated, ["update", "updates"])})`,
    nothingToImport: "Every record in these files is already up to date.",
    confirmOverwrite: (n: number) =>
      `Overwrite ${n} existing ${enPlural(n, ["record", "records"])}`,
    confirmOverwriteMsg: (n: number) =>
      `This import changes ${n} existing ${enPlural(n, ["record", "records"])}. Review the changes above.`,
    // ADR 0160: loan events stored on a mortgage block (set in the mortgage form).
    confirmReplaceMsg: (n: number) =>
      `${n} new loan ${enPlural(n, ["block stops", "blocks stop"])} saved loan events of the previous block. Review them above.`,
    confirmReplace: "Import anyway",
    replacedEvent: (issue: string) => `Previous loan block: ${issue}`,
    noEffectNote:
      "Starts before the loan block in force, so the amortization schedule does not use it. It can still count as the acquisition loan.",
    storedEventKind: {
      prepayments: "prepayment",
      recasts: "maturity change",
      draws: "draw",
    },
    errStoredEvent: (event: string, date: string, rule: string) =>
      `${rule} — the saved ${event} of ${date}. It is set in the property's mortgage form, not in the CSV: change or remove it there first, or keep the old value in this file.`,
    planChanged:
      "Your data changed since this preview, so nothing was imported. Review the updated preview and import again.",
    // Error-code → message map (csv.ts emits codes; UI renders these)
    errRequired: "Required",
    errInvalidDate: (v: string) => `Invalid date "${v}" — use YYYY-MM-DD`,
    errInvalidNumber: (v: string) => `Invalid number "${v}"`,
    errInvalidInteger: (v: string) => `Invalid integer "${v}"`,
    errInvalidBoolean: (v: string) =>
      `Invalid boolean "${v}" — use true/false, yes/no or 1/0`,
    errUnknownProperty: (v: string) => `Unknown property "${v}"`,
    errInstalmentRequired:
      "Required (or provide loan_term_years to auto-calculate)",
    errImpossibleDate: (v: string) => `"${v}" is not a real calendar date`,
    errEarlyDate: (v: string, floor: string) =>
      `"${v}" is before ${floor}, the earliest date the app accepts — check the year for a typo`,
    errDecimalComma: (v: string) =>
      `"${v}" uses a decimal comma — write numbers with a decimal point and no spaces (e.g. 4800000.40)`,
    errNegativeAmount: (v: string) => `Amount "${v}" must not be negative`,
    errRateOutOfRange: (v: string) =>
      `Rate "${v}" must be a fraction from zero to one — write 3.9 % as 0.039`,
    errNotPositive: (v: string) =>
      `"${v}" — the loan term must be at least one year`,
    errOutOfRange: (v: string, min: string, max: string) =>
      `"${v}" must be a whole number from ${min} to ${max}`,
    errDuplicateKey: (firstRow: number) =>
      `Duplicate of row ${firstRow} — each record may appear only once per file`,
    errMalformedRow: (expected: number, found: number) =>
      `This line has ${found} columns; the header has ${expected}`,
    errBadQuotes: "Unbalanced quotation marks on this line",
    errNotUtf8:
      'The file is not UTF-8 (probably Windows-1250 from Excel) — save it as "CSV UTF-8"',
    errSemicolon:
      'The file is separated by semicolons — save it as "CSV UTF-8 (comma delimited)"',
    errFileTooLarge: (limitMb: number) =>
      `The file is larger than ${limitMb} MB`,
    errTooManyRows: (limit: number) =>
      `The file has more than ${limit.toLocaleString("en")} data rows`,
    importRefused: "Nothing was imported. Correct these rows and import again:",
    importFailed: (detail: string) =>
      `The import failed and was rolled back — nothing was imported. (${detail})`,
    previewFailed: (detail: string) =>
      `The files could not be checked against your saved data, so nothing can be imported yet. (${detail})`,
    templateFailed: (detail: string) =>
      `The template could not be saved. (${detail})`,
    colFile: "File",
    wholeFile: "File",
  },

  backup: {
    exportTitle: "Export backup",
    exportHint:
      "Saves all properties, mortgages, valuations, leases, assumptions, and scenarios",
    exportBody:
      "Exports the entire portfolio to a versioned JSON file. Use this to create a snapshot before making large changes.",
    exportButton: "Export backup…",
    lastBackup: (date: string, ago: string) => `Last backup: ${date} (${ago})`,
    noBackupYet: "No backup exported yet",
    agoToday: "today",
    agoDays: (n: number) => `${n} ${enPlural(n, ["day", "days"])} ago`,
    agoWeeks: (n: number) => `${n} ${enPlural(n, ["week", "weeks"])} ago`,
    offDevice: "Keep a copy somewhere other than this Mac.",
    exporting: "Exporting…",
    restoreTitle: "Restore from backup",
    restoreHint: "Overwrites all current data",
    restoreBody:
      "Choose a previously exported JSON file to restore. A safety backup of the current data will be saved automatically before overwriting.",
    chooseFile: "Choose backup file…",
    restoreFrom: (file: string) => `Restore from ${file}?`,
    restoreWarning:
      "⚠ This will overwrite all current data (properties, mortgages, valuations, leases, assumptions, and scenarios). A safety backup will be saved first.",
    restoreNow: "Restore now",
    // ADR 0148, ADR 0149: values the forms refuse (outside a range, a date before 1900)
    // ask instead of refusing.
    warnOutOfRange: (n: number) =>
      n === 1
        ? "This backup holds 1 value the forms do not accept. The app computes with it, and the Data check lists it after the restore. Restore anyway?"
        : `This backup holds ${n} values the forms do not accept. The app computes with them, and the Data check lists them after the restore. Restore anyway?`,
    warningsTitle: "Values the forms do not accept",
    restoreAnyway: "Restore anyway",
    restoring: "Restoring…",
    errorTitle: "Error",
    savedTo: (file: string) => `Backup saved to ${file}`,
    downloaded: "Backup downloaded",
    restored: (file: string) =>
      `Portfolio restored. Your previous data was saved as ${file} in the backups folder next to the database.`,
    exportFailed: (detail: string) =>
      `The backup could not be saved. (${detail})`,
    safetyBackupFailed: (detail: string) =>
      `Restore aborted: a safety backup of your current data could not be saved, so nothing was changed. (${detail})`,
    restoreFailed: (detail: string) =>
      `The restore failed and was rolled back — your current data is unchanged. (${detail})`,
    backupDate: (date: string) => `Exported on ${date}`,
    olderVersion:
      "Written by an older app version; it is upgraded as it is restored.",
    holds: "The file holds:",
    tables: {
      properties: "Properties",
      mortgage_blocks: "Mortgages",
      valuations: "Valuations",
      leases: "Leases",
      holding_costs: "Holding costs",
      assumptions: "Assumptions",
      scenarios: "Scenarios",
    },
    errTooLarge: (limitMb: number) =>
      `The file is larger than ${limitMb} MB, so it is not a backup of this app.`,
    errNotJson: "The file is not a JSON backup.",
    errInvalid: (detail: string) =>
      `The file is not a valid backup of this app. (${detail})`,
    errUnreadable: (detail: string) =>
      `The file could not be read. Check that the disk is connected and the file is downloaded. (${detail})`,
    errNewer: (detail: string) =>
      `This backup was written by a newer version of the app (${detail}). Restore it with that version.`,
    errRowsInvalid:
      "The backup holds records the app cannot restore. Nothing was changed. Records involved:",
    colTable: "Table",
    colRecord: "Record",
    colColumn: "Column",
    colProblem: "Problem",
    issueUnreadable: "A value cannot be read",
    issueDuplicate: "Repeats an earlier record",
    issueMissingAssumptions:
      "The file must hold exactly one assumptions record",
    issueOutOfRange: (min: string, max: string) =>
      `Must be a whole number from ${min} to ${max}`,
    issueEarlyDate: (floor: string) => `Must be a date from ${floor}`,
  },

  // First-run sample portfolio (ADR 0094).
  sample: {
    banner: "You're looking at a sample portfolio with fictional apartments.",
    clearAction: "Clear sample and start my own",
    keepExploring: "Keep exploring",
    dialogTitle: "Clear the sample portfolio?",
    dialogDeletes:
      "This deletes the three sample apartments and every record under them — mortgages, valuations, leases and costs — including any you added to them.",
    dialogKeeps:
      "Properties you added yourself, your assumptions and your scenarios are kept.",
    dialogBackup:
      "A safety backup of all current data is saved first, in the backups folder next to the database.",
    confirm: "Clear sample",
    clearing: "Clearing…",
    cleared: (file: string) =>
      `Sample cleared. Your previous data was saved as ${file} in the backups folder next to the database.`,
    safetyBackupFailed: (detail: string) =>
      `Nothing was cleared: a safety backup of your current data could not be saved. (${detail})`,
    clearFailed: (detail: string) =>
      `Clearing the sample failed and was rolled back — your data is unchanged. (${detail})`,
    panelTitle: "Sample portfolio",
    panelBody:
      "Delete the sample apartments to start your own portfolio. Properties you added yourself are kept.",
    loadHint: "Fictional apartments to explore the app",
    loadBody:
      "Load three fictional apartments with their mortgages, leases and costs. Your assumptions stay as they are.",
    loadAction: "Load sample portfolio",
    loading: "Loading…",
    loaded:
      "Sample portfolio loaded. Clear it any time here or from the banner.",
    errNotEmpty:
      "The sample loads only into an empty portfolio. Nothing was added.",
    loadFailed: (detail: string) =>
      `Loading the sample failed and was rolled back — nothing was added. (${detail})`,
    gettingStartedTitle: "Getting started",
    stepAssumptions: "Set your assumptions",
    stepAddProperty: "Add a property",
    stepDetails: "Add its mortgage, lease and costs",
    stepReview: "Review the projections",
    stepBackup: "Export a backup",
  },
  xlsx: {
    exportToExcel: "Export to Excel",
    exported: (name: string) => `Exported ${name}`,
    exportFailed: (detail: string) => `Export failed (${detail})`,
    // Excel sheet names (DR-152, UX-080): ≤ 31 characters, none of []:*?/\.
    sheetNames: {
      projection: "Projection",
      amortization: "Amortization",
      compareKeyFigures: "Key figures",
      compareNetWorth: "Net worth",
      compareNetCashFlow: "Net cash flow",
      compareLtv: "LTV",
    },
    // First column header of the Scenario compare key-figures sheet (ADR 0108).
    metric: "Metric",
  },

  forms: {
    required: "Required",
    invalidHint: {
      date: "Enter a date from 01.01.1900 as dd.mm.yyyy",
      money:
        "Enter an amount of 0 or more, e.g. 1 250 000 (a space between thousands)",
      pct: "Enter a percentage, e.g. 4,5",
      int: "Enter a whole number, e.g. 25",
      prepayments:
        "Check the marked rows: a date as dd.mm.yyyy, an amount above 0 and a fee of 0 or more",
      recasts:
        "Check the marked rows: a date as dd.mm.yyyy, and a new maturity date or an instalment above 0",
      draws:
        "Check the marked rows: a date as dd.mm.yyyy and an amount above 0",
    },
    /** A bounded whole-number field (UX-068, ADR 0075). */
    positiveAmount: "Enter an amount above 0, e.g. 500 000",
    intRange: (min: string, max: string) =>
      `Enter a whole number from ${min} to ${max}`,
    datePlaceholder: "dd.mm.yyyy",
    defaultPlaceholder: "default",
  },

  propertyForm: {
    addTitle: "Add property",
    editTitle: "Edit property",
    name: "Name",
    address: "Address",
    type: "Type",
    typeHelp: "e.g. 1 bedroom, 2 bedroom",
    size: "Size (m²)",
    garage: "Garage",
    garageYes: "Yes",
    purchaseDate: "Purchase date",
    purchasePrice: "Purchase price",
    appreciationOverride: "Appreciation override",
    rentIndexOverride: "Rent index override",
    overrideHelp: "Leave blank to use the global Assumptions value",
    errNameExists: "A property with this name already exists",
    acquisitionSection: "Acquisition (optional)",
    acquisitionHelp:
      "How the purchase was funded. A blank amount is unknown; 0 is an amount. For a property bought after the projection start, own cash is its down payment.",
    ownCash: "Own cash",
    ownCashHelp:
      "All your own money paid in at the purchase, costs and works included",
    transactionCosts: "Transaction costs",
    transactionCostsHelp: "Broker, legal, cadastre, valuation and similar fees",
    initialWorks: "Initial works",
    initialWorksHelp:
      "Renovation or furnishing paid at or right after the purchase",
    fundingNote: "Funding note",
    unknownPlaceholder: "unknown",
  },

  // Projection grid headers, on screen and in the Excel export (UX-062,
  // src/ui/model/projection.ts).
  projGrid: {
    /** One-letter "year" prefix for "Y5 · 2031" labels (UX-032). */
    yearPrefix: "Y",
    year: "Year",
    opening: "opening",
    period: "Period",
    value: "Value",
    debt: "Debt",
    undrawn: "Undrawn",
    equity: "Equity",
    ltv: "LTV",
    grossRent: "Gross rent",
    effective: "Effective",
    holding: "Holding",
    noi: "NOI",
    interest: "Interest",
    principal: "Principal",
    debtSvc: "Debt svc",
    draws: "New debt",
    refinanced: "Refinance difference",
    prepaid: "Prepaid",
    prepaymentFees: "Prepayment fees",
    netCf: "Net CF",
    cashToOwner: "Cash to owner",
    dscr: "DSCR",
    caption: "Year-by-year projection",
  },

  about: {
    title: "About",
    subtitle: APP_NAME,
    version: (v: string) => `Version ${v}`,
    tagline: "A local-first tracker for your rental-apartment portfolio.",

    appTitle: "What this app does",
    appBody:
      "Track your rental apartments in one place: current value, debt and equity, rent, holding costs and cash flow. It projects nominal and real outcomes over your chosen horizon (30 years by default), surfaces KPIs like LTV, DSCR, yields and IRR, and lets you stress-test the portfolio with what-if scenarios.",
    // ADR 0105: the language setting changes UI text only (also shown in the Guide).
    formatsNote:
      "Language changes the interface text only. Amounts are always in Czech crowns (Kč) with Czech number and date formats.",

    privacyTitle: "Private by design",
    privacyBody:
      "Everything runs offline on your Mac. Your portfolio lives in a local SQLite database — no accounts, no cloud, no analytics. Your data never leaves the device.",

    developerTitle: "Developer",
    developerName: "Vlastimil Bureš",
    feedbackLabel: "Feedback",
    feedbackText: "github.com/vlastimilbures/real-estate-tracker/issues",
    sourceLabel: "Source",
    sourceText: "github.com/vlastimilbures/real-estate-tracker",
    limitsLabel: "Model limits",
    limitsText:
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/model-limitations.md",
    dataSafetyLabel: "Data safety",
    dataSafetyText:
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/data-safety.md",

    builtWithTitle: "Built with",
    builtWithBody: "Tauri 2 · React · TypeScript · SQLite · decimal.js",
    precisionNote:
      "Money is computed with exact decimal arithmetic (never floating point). Results are tested against reference figures within ±1 Kč.",

    copyright: "© 2026 Vlastimil Bureš",
    usageNote: "Made for personal use.",
  },

  guide: {
    title: "Guide",
    subtitle: "How the numbers are calculated and what they mean",
    eg: "e.g.",
    howItWorksTitle: "How it works",
    howItWorksHint: "From your data to the numbers on screen",
    cardFlowTitle: "One-way data flow",
    cardFlowBody:
      "Your records run through a pure calculation engine, then the screens display the result. No figure is typed in by hand — every one is derived.",
    cardAsOfTitle: "Everything is “as of” a date",
    cardAsOfBody:
      "A snapshot is your portfolio on a chosen day; a projection rolls it forward by year. The base-date snapshot equals year 0 of the projection.",
    cardEffectiveTitle: "Records are effective-dated",
    cardEffectiveBody:
      "Valuations, leases and mortgages each have a date range. For any day the engine picks the one in force — so an expiring lease hands over to the next.",
    cardDataCheckTitle: "The data check shows the fallbacks",
    cardDataCheckBody:
      "When a valuation is old or missing, no lease is in force, a fixation ended without new terms, a property uses the portfolio defaults, or its own cash at purchase is not recorded, the Data check on the Dashboard and on each property says so, what it changes and where to fix it.",
    snapshotTitle: "Snapshot metrics",
    snapshotHint: "The current picture of a property or the portfolio",
    snapshotProse:
      "Portfolio totals add up only the properties you currently own and that are active; ratios like portfolio LTV and DSCR come from those totals. Deactivating a property only leaves it out: it does not record a sale, sale proceeds or a loan payoff.",
    mortgagesTitle: "Mortgages & fixation",
    mortgagesHint: "How the loan balance moves over time",
    mortgagesProse1Pre: "Loans are ",
    mortgagesProse1Annuities: "annuities",
    mortgagesProse1Mid:
      " — a constant monthly instalment, split interest first: ",
    fInterest: "interest = balance × rate ÷ 12",
    fPrincipal: "principal = instalment − interest",
    fNewBalance: "new balance = balance − principal",
    mortgagesProse1Post:
      ". Early on the payment is mostly interest; as the balance shrinks, more goes to principal, while the instalment stays the same.",
    mortgagesProse2Pre: "Czech mortgages have a ",
    mortgagesProse2Fixation: "fixation period",
    mortgagesProse2Mid:
      " — the years the rate is locked. When it ends the rate ",
    mortgagesProse2Resets: "resets",
    mortgagesProse2Mid2: " to your post-fixation rate and the instalment ",
    mortgagesProse2Reamortizes: "re-amortizes",
    mortgagesProse2Post:
      " to clear the remaining balance over the remaining term, so the payment can step up or down at that date. The property page's Loan outlook lists each loan block's modelled fixation end, the balance that moves to the new rate, and the loan's remaining term.",
    mortgagesProse3:
      "Prepayments and maturity changes are entered on each loan block, in its form. A prepayment repays extra principal on its date and either lowers the instalment or shortens the term; its fee is paid in cash and does not reduce the debt. A maturity change moves the loan to a new maturity date or a new instalment. Prepayments are your own cash, kept outside net cash flow and DSCR, but counted in cash to owner and the IRR. The property page shows the modelled payoff and the interest the prepayments save over the loan's remaining life, and warns when one is larger than the balance or falls after payoff.",
    projectionTitle: "Projection to the horizon",
    projectionHint: "Rolling the snapshot forward",
    projectionProse1:
      "Every input is grown forward, year by year, to the horizon (30 years by default, set in Settings → Assumptions):",
    projectionProse2:
      "A property or lease starting mid-year is pro-rated for that first year. Built-in check: when every loan is repaid within the horizon, total principal repaid equals the starting debt plus any later draws — never more, never less. Outputs include the first cash-flow-positive year and the debt-free year.",
    nominalRealTitle: "Nominal vs Real",
    nominalRealHint: "The toggle on the Dashboard & Projections",
    nominalRealProsePre:
      "Nominal figures are future crowns at face value. Real figures strip out inflation to show purchasing power at the base date (the projection start): ",
    fCpi: "CPI = Π (1 + inflation)",
    fReal: "real = nominal ÷ CPI",
    nominalRealProsePost:
      ". At 2.5% inflation, 1.0M in 30 years is worth ≈ 477k in base-date money.",
    nominalRealTodayNote:
      "Because real values are deflated to the projection start, a Today snapshot dated after it reads slightly below its nominal value. This is intended.",
    returnsTitle: "Returns over the horizon",
    returnsHint: "Growth and cash flow as one number",
    scenariosTitle: "Scenarios",
    scenariosHint: "What-if testing without touching your data",
    scenariosProse:
      "A scenario overrides assumptions only — never your underlying properties or mortgages — so you can compare freely and switch back. Alongside permanent settings (appreciation, indexation, vacancy, reset rate, inflation) you can apply temporary shocks:",
    developmentTitle: "Development properties",
    developmentHint: "Construction financed in tranches",
    developmentProsePre:
      "A property under construction can be funded by a development loan drawn in ",
    developmentTranches: "tranches",
    developmentProseMid: ". During construction the loan is ",
    developmentInterestOnly: "interest-only",
    developmentProsePost:
      " (no principal). The debt shown is what has been drawn, and the value shown is the completed value less the tranches not drawn yet, so both rise with each draw and equity does not move. Interest is charged only on what is drawn; LTV counts the whole loan against the completed value, as the bank does. When a tranche lands or construction completes, the loan re-amortizes onto a normal repaying schedule. In the mortgage form, choose Development and fill in the drawdown schedule: the amount drawn on the start date, then a row for each later tranche.",
    limitsTitle: "Limits and data safety",
    limitsProse:
      "These figures are planning estimates, not lender quotes or guaranteed outcomes. Two documents in the source repository explain what the model simplifies or leaves out, and how to back up your data and recover it after a failed upgrade.",
    glossaryTitle: "Glossary",
    // Definition tables
    snapshotDefs: {
      value: {
        name: "Value",
        formula: "valuation × (1 + appreciation) ^ years",
        meaning:
          "Market value, grown from the latest recorded valuation. A new valuation re-anchors the curve. While a development loan is drawing, the value shown is the completed value less the tranches not drawn yet.",
        eg: "5.0M at 4%/yr → 5.0M × 1.04² ≈ 5.41M after 2 years.",
      },
      debt: {
        name: "Debt",
        formula: "outstanding balance",
        meaning:
          "Remaining loan balance from the amortization schedule — reflects every payment and any rate reset. A development loan counts what has been drawn; its tranches not drawn yet are shown beside it.",
      },
      equity: {
        name: "Equity",
        formula: "value − debt",
        meaning:
          "What the property is worth to you once the bank is paid off — your net stake.",
        eg: "5.41M − 2.6M = 2.81M.",
      },
      ltv: {
        name: "LTV",
        formula: "debt ÷ value",
        meaning:
          "Share of the property funded by the bank. Lower = safer cushion against a price drop. While a development loan is drawing, it is the whole loan ÷ the completed value, as the bank measures it.",
        eg: "2.6M ÷ 5.4M ≈ 48% financed.",
      },
      grossRent: {
        name: "Gross annual rent",
        formula: "monthly rent × 12",
        meaning: "Headline yearly rent, before empty months or costs.",
        eg: "20k/mo × 12 = 240k.",
      },
      effectiveIncome: {
        name: "Effective gross income",
        formula: "gross rent × (1 − vacancy)",
        meaning:
          "Rent you realistically collect, allowing for the flat sometimes sitting empty.",
        eg: "240k × (1 − 5%) = 228k.",
      },
      holdingCosts: {
        name: "Holding costs",
        formula: "fixed + (mgmt% + maint%) × gross rent",
        meaning:
          "Annual running cost: fixed line items (tax, insurance, SVJ, other) plus % -of-rent management and maintenance.",
        eg: "36k + (15%+5%)×240k = 84k.",
      },
      noi: {
        name: "NOI",
        formula: "effective income − holding costs",
        meaning:
          "Operating profit before the mortgage — the cash the asset itself throws off.",
        eg: "228k − 84k = 144k.",
      },
      debtService: {
        name: "Annual debt service",
        formula: "monthly instalment × 12",
        meaning:
          "Total mortgage payments over a year (interest plus principal).",
        eg: "10k/mo → 120k.",
      },
      netCashFlow: {
        name: "Net cash flow",
        formula: "NOI − debt service",
        meaning:
          "Modelled yearly cash flow after costs and mortgage — an estimate, not a bank-account record. Can be negative.",
        caveat: "Not actual receipts.",
        eg: "144k − 120k = +24k.",
      },
      dscr: {
        name: "DSCR",
        formula: "NOI ÷ debt service",
        meaning:
          "Whether rent covers the mortgage. Above 1.0 the property pays its own loan; below, you top it up.",
        eg: "144k ÷ 120k = 1.20× (20% to spare).",
      },
      grossYield: {
        name: "Gross yield",
        formula: "gross rent ÷ value",
        meaning:
          "Rent as a % of value, ignoring costs and debt — a quick comparison number.",
        eg: "240k ÷ 5.4M ≈ 4.4%.",
      },
      netYield: {
        name: "Net yield (cap rate)",
        formula: "NOI ÷ value",
        meaning:
          "Return on value after running costs, ignoring the mortgage — the standard comparison.",
        eg: "144k ÷ 5.4M ≈ 2.7%.",
      },
      weightedAvgRate: {
        name: "Weighted-avg rate",
        formula: "Σ(debt × rate) ÷ total debt",
        meaning:
          "Blended borrowing cost across all mortgages, weighted so bigger loans count more.",
        eg: "1M@2% + 3M@4% → 3.5%.",
      },
    },
    projectionDefs: {
      value: {
        name: "Value",
        formula: "compounds at appreciation",
        meaning: "Grows each year at the appreciation rate.",
      },
      rent: {
        name: "Rent",
        formula: "lease by lease, indexed",
        meaning:
          "Follows your leases month by month. A gap between leases earns nothing, the last lease is treated as renewed, and each lease is indexed from its start.",
      },
      vacancy: {
        name: "Vacancy",
        formula: "applied every year",
        meaning:
          "The vacancy allowance is taken on rent each year, as in the snapshot.",
      },
      costs: {
        name: "Costs",
        formula: "grow with CPI",
        meaning:
          "Holding costs inflate via a CPI index built from the inflation rate.",
      },
      debt: {
        name: "Debt",
        formula: "amortization schedule",
        meaning: "Follows the schedule, including fixation resets.",
      },
      nextReset: {
        name: "Next rate reset",
        formula: "start + fixation years",
        meaning:
          "The earliest modelled fixation end ahead, with the schedule balance after the payment due that day. That balance moves to the reset rate.",
        caveat:
          "Modelled from the loans you entered, not a date from your lender.",
      },
      debtResetting: {
        name: "Debt resetting within N years",
        formula: "Σ balances at fixation ends in the window",
        meaning:
          "How much debt reaches a fixation end within the next 1, 3 or 5 years, counted once per fixation end.",
      },
      totalInterest: {
        name: "Total interest",
        formula: "Σ interest, years 1…N",
        meaning:
          "All interest the loans pay over the horizon, including interest on a loan that runs before a property's purchase date. The real lens deflates each year's interest by that year's inflation index.",
      },
    },
    returnsDefs: {
      multiple: {
        name: "Net-worth multiple",
        formula: "equity at horizon ÷ equity at projection start",
        meaning:
          "How many times your equity at the projection start is expected to grow by the horizon.",
        eg: "22M → 110M = 5.0×.",
      },
      cagr: {
        name: "CAGR",
        formula: "(end ÷ start) ^ (1 ÷ years) − 1",
        meaning:
          "The smoothed, steady yearly growth rate from start to end value.",
        eg: "5× over 30 yrs ≈ 5.5%/yr.",
      },
      irr: {
        name: "Levered IRR",
        formula: "rate where NPV = 0",
        meaning:
          "The annual return from the projection start, treating that day's equity as the amount invested, plus yearly cash flows and the projected equity at the horizon (no selling costs or tax), with the mortgage in the mix.",
        caveat: "Not the return on your original purchase cash.",
        eg: "negative early, large equity at horizon → ≈ 6%/yr.",
      },
      cashInvested: {
        name: "Cash invested",
        formula: "Σ recorded own cash",
        meaning:
          "The own money recorded as paid in at each purchase, costs and works included, set in the property form's Acquisition section. The Dashboard shows the total only when every active property has it.",
        caveat:
          "The multiple, CAGR and IRR do not start from it; for a property bought after the projection start it is the down payment.",
        eg: "1.5M + 1.7M + 2.0M = 5.2M.",
      },
      sourcesUses: {
        name: "Sources and uses",
        formula:
          "uses = price + costs + works; sources = own cash + acquisition loan",
        meaning:
          "A check of the recorded funding on each property page. A gap of 1 Kč or more either way shows as a warning, never a blocker. The acquisition loan is the first loan block when it starts no later than 90 days after the purchase, or a development loan whatever its start.",
        eg: "uses 7.30M, sources 7.25M → 50k short.",
      },
    },
    scenarioDefs: {
      inflationShock: {
        name: "Inflation shock",
        formula: "+Δ for N years",
        meaning: "A temporary jump in inflation, then back to trend.",
      },
      rateShock: {
        name: "Rate shock",
        formula: "+Δ around refix",
        meaning: "A higher rate around a fixation reset for a set period.",
      },
      valueCrash: {
        name: "Value crash",
        formula: "one-off drop in year Y",
        meaning:
          "A one-off fall in value; growth resumes from the lower base. A crash at projection start lowers starting equity, so percentage returns can rise while your wealth falls.",
      },
    },
    glossary: {
      noi: {
        term: "NOI",
        def: "Net operating income: effective rent − holding costs.",
      },
      dscr: {
        term: "DSCR",
        def: "NOI ÷ debt service. Above 1 = rent covers the mortgage.",
      },
      ltv: { term: "LTV", def: "Loan-to-value: debt ÷ value." },
      capRate: { term: "Cap rate / net yield", def: "NOI ÷ value." },
      grossYield: { term: "Gross yield", def: "Gross rent ÷ value." },
      equity: { term: "Equity", def: "Value − debt; your net stake." },
      egi: {
        term: "Effective gross income",
        def: "Gross rent after the vacancy allowance.",
      },
      annuity: {
        term: "Annuity",
        def: "A constant payment; interest-heavy early, principal-heavy later.",
      },
      fixation: {
        term: "Fixation",
        def: "The years a Czech mortgage's rate is fixed.",
      },
      reset: {
        term: "Reset / re-amortize",
        def: "At fixation end the rate changes and the instalment is recalculated.",
      },
      svj: {
        term: "SVJ / fond oprav",
        def: "Building repair fund (a monthly cost).",
      },
      propertyTax: {
        term: "Daň z nemovitých věcí",
        def: "Annual property tax.",
      },
      cagr: { term: "CAGR", def: "Compound annual (smoothed) growth rate." },
      irr: {
        term: "IRR",
        def: "The single annual return that balances the cash-flow vector.",
      },
      nominal: { term: "Nominal", def: "Future crowns at face value." },
      real: {
        term: "Real",
        def: "Purchasing power at the base date (inflation removed).",
      },
    },
  },
};

export type Dictionary = typeof en;
