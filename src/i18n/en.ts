// English dictionary — the source of truth. `Dictionary = typeof en`, and cs.ts / ru.ts
// are annotated `: Dictionary`, so any key added here that they don't mirror is a tsc
// error. Leaves are plain strings or `(params) => string` for interpolation/plurals.
//
// Number/date/currency formatting is NOT localized (see src/lib/format.ts): the app is a
// single-currency Czech tracker, so amounts stay "28 730 000 Kč" and dates dd.mm.yyyy in
// every language. Only UI chrome is translated.
import type { ValidationCode } from "../engine";
import { enPlural } from "./plural";

export const en = {
  common: {
    /** A KPI with no value, e.g. a levered IRR (UX-079). */
    notApplicable: "n/a",
    irrNotUnique:
      "No unique IRR: the cash flows break even at more than one rate",
    irrNoRoot: "No IRR between −90 % and +1000 %",
    /** Unit shown inside year-count fields (UX-034). */
    yearsSuffix: "yrs",
    asOfGroup: "As of date",
    plusYears: (n: number) => `+${n}y`,
    searchProperties: "Search properties",
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
    asOfHintBeyond: (d: string) =>
      `Beyond the horizon — showing records in force on ${d}, not a projection`,
    asOfHintSnapshot: (d: string) => `Showing records in force on ${d}`,
    noPortfolioTitle: "No portfolio yet",
    noPortfolioBody: "Add a property or import CSV files to begin.",
    importCsv: "Import CSV",
    nominal: "Nominal",
    real: "Real",
    // Lowercase lens words used mid-sentence (e.g. "5.0× today · nominal").
    nominalLower: "nominal",
    realLower: "real",
  },

  app: {
    loadingEyebrow: "Real Estate Portfolio",
    loading: "Loading your portfolio…",
    dbErrorEyebrow: "Could not open the database",
    bootRetryHint:
      "Nothing on disk was changed. Try again; if it keeps failing, quit and reopen the app, and keep the log file for diagnosis.",
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
      "A draw must be dated after the loan start; money drawn on the start date belongs in the initial principal",
    DRAW_AFTER_SCHEDULE_END:
      "A draw must be dated before the loan's final payment date (start date plus loan term)",
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
    ASOF_BEFORE_BASEDATE: "The date is before the base date",
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
  },

  dataErrors: {
    DB_INTEGRITY:
      "The database file failed its integrity check. Nothing was changed. Close the app and restore your most recent copy of the database.",
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
    about: "About Real Estate Tracker",
    settings: "Settings…",
    newProperty: "New Property…",
  },

  // Chart cards: the toggle that shows a chart as a table (UX-075).
  charts: {
    table: "Table",
  },

  shell: {
    offline: "Offline · local-first",
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
    subEquityChange: "appreciation + debt repayment",
    chartNetCashFlowByYear: "Net cash flow by year",
    chartRentGrossVsEffective: "Rent — gross vs effective",
    chartNoiVsDebtService: "NOI vs debt service",
    chartLoanToValue: "Loan-to-value",
    subNetCashFlow: "green positive, red negative",
    subLtv: "% — falls as debt amortizes",
    seriesValue: "Value",
    seriesDebt: "Debt",
    seriesEquity: "Equity",
    seriesAppreciation: "Appreciation",
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
    kpiCumulativeNetCashFlow: (n: number) =>
      `Cumulative net cash flow (Yrs 1–${n})`,
    kpiFirstCfPositiveYear: "First cash-flow-positive year",
    kpiDebtFullyRepaid: "Debt fully repaid",
    kpiSumPrincipalRepaid: (n: number) => `Σ principal repaid (Yrs 1–${n})`,
    kpiSumPrincipalRepaidNominal: (n: number) =>
      `Σ principal repaid (Yrs 1–${n}, nominal)`,
    kpiWeightedAvgRate: "Weighted-avg interest rate",
  },

  properties: {
    title: "Properties",
    subtitle: (n: number) => `${n} ${enPlural(n, ["apartment", "apartments"])}`,
    addProperty: "Add property",
    emptyTitle: "No properties",
    emptyBody: "Add a property with the button above, or import data from CSV.",
    colProperty: "Property",
    colValue: "Value",
    colDebt: "Debt",
    colEquity: "Equity",
    colLtv: "LTV",
    colNoi: "NOI",
    colNetCashFlow: "Net cash flow",
    colDscr: "DSCR",
    badgePending: "Pending",
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
    inactiveBadge: "Inactive",
    inactiveNote:
      "This property is excluded from portfolio dashboards and projections.",
    sizeM2: (n: number) => `${n} m²`,
    marketValue: "Market value",
    debt: "Debt",
    equity: "Equity",
    dscr: "DSCR",
    ltv: "LTV",
    badgeShort: "Short",
    netCf: "Net CF",
    chartValueVsDebtVsEquity: "Value vs debt vs equity",
    chartNetCashFlowByYear: "Net cash flow by year",
    subMKcMode: (mode: string) => mode,
    seriesValue: "Value",
    seriesDebt: "Debt",
    seriesEquity: "Equity",
    seriesNetCashFlow: "Net cash flow",
    // Entity panels
    valuationsTitle: "Valuations",
    valuationsHint:
      "effective-dated market values — for a development property this is the completed (target) value; the shown value ramps with the mortgage draws",
    addValuation: "valuation",
    colValidFrom: "Valid from",
    colValidTo: "Valid to",
    colMarketValue: "Market value",
    leasesTitle: "Leases",
    leasesHint: "the lease in force on the As-of date sets the rent shown",
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
    draws: (n: number) => `${n} ${enPlural(n, ["draw", "draws"])}`,
    ioUntil: (d: string) => `IO→${d}`,
    // Mortgage form hints and the instalment "Calc" button (DR-059)
    instalmentHint: (years: string, amount: string) =>
      `Amortizing instalment over ${years} ≈ ${amount}`,
    instalmentHintDev: (base: string) =>
      `${base} — for the initial principal; re-amortizes at each draw and at completion. Loan term is required.`,
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
    fieldDraws: "Development draws (after start)",
    helpDraws:
      "ADDITIONAL tranches drawn AFTER the start date — one per line: dd.mm.yyyy = amount. The first drawdown is the Initial principal field (do not repeat it here). Total loan = initial principal + these draws; property value ramps with cumulative drawn ÷ total.",
    fieldCompletionDate: "Interest-only until (completion)",
    helpCompletionDate: "pay interest only until this date, then re-amortize",
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
    fieldContractMaturity: "Contract maturity date",
    helpContractMaturity:
      "from the loan contract; blank = not checked; not used for development loans",
    amortizationWarnExpected: "Expected instalment ≈",
    amortizationTitle: "Amortization schedule",
    amortizationMonths: (n: number) =>
      `${n} ${enPlural(n, ["month", "months"])}`,
    amColMonth: "Month",
    amColDate: "Date",
    amColRate: "Rate",
    amColInstalment: "Instalment",
    amColInterest: "Interest",
    amColPrincipal: "Principal",
    amColEndBalance: "End balance",
    realTermsLens: "real terms",
    nominalKcLens: "nominal Kč",
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
    nominalKc: "nominal Kč",
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
    atStart: "Start",
    atStartTitle: (date: string) => `At projection start (${date})`,
    rateShockAtRefix: "Rate shock @ refix",
    inflationShock: "Inflation shock",
    priceCrash: "Price crash",
    applyCrashAt: (label: string) => `Apply the crash at ${label}`,
    rateForYears: (label: string, years: number) =>
      `Rates ${label} for ${years}y`,
    inflForYears: (label: string, years: number) =>
      `Inflation ${label} for ${years}y`,
    crashTitle: (label: string, suffix: string) =>
      `Price crash ${label}${suffix}`,
    crashAt: (label: string) => ` @ ${label}`,
    addedScenario: (name: string) => `Added “${name}”`,
    duplicatedScenario: (name: string) => `Duplicated “${name}”`,
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
    rebasedReturnsFootnote: (names: string) =>
      `Returns for ${names} are measured from a lower starting equity after the price crash; compare Δ net worth vs Base for the loss to you.`,
    kpiNetWorthNominal: "Net worth (nominal)",
    kpiNetWorthReal: "Net worth (real)",
    kpiNetWorthMultiple: "Net-worth multiple",
    kpiCagrNominal: "CAGR (nominal)",
    kpiCagrReal: "CAGR (real)",
    kpiCumulativeNetCf: "Cumulative net CF",
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
    permanentCorrection: "permanent correction",
    defaultYears: (n: number) => `default ${n}`,
    zeroIsStart: (date: string) => `0 = projection start (${date})`,
    none: "none",
    invalidPct: "Invalid %",
    geOne: "≥ 1",
    geZero: "≥ 0",
    required: "Required",
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
    upserted: (v: number) => `${v} added or updated`,
    // Error-code → message map (csv.ts emits codes; UI renders these)
    errRequired: "Required",
    errInvalidDate: (v: string) => `Invalid date "${v}" — use YYYY-MM-DD`,
    errInvalidNumber: (v: string) => `Invalid number "${v}"`,
    errInvalidInteger: (v: string) => `Invalid integer "${v}"`,
    errInvalidBoolean: (v: string) =>
      `Invalid boolean "${v}" — use true or false`,
    errUnknownProperty: (v: string) => `Unknown property "${v}"`,
    errInstalmentRequired:
      "Required (or provide loan_term_years to auto-calculate)",
    errImpossibleDate: (v: string) => `"${v}" is not a real calendar date`,
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
  },

  xlsx: {
    exportToExcel: "Export to Excel",
    exported: (name: string) => `Exported ${name}`,
    exportFailed: (detail: string) => `Export failed (${detail})`,
    // Excel sheet names (DR-152, UX-080): ≤ 31 characters, none of []:*?/\.
    sheetNames: { projection: "Projection", amortization: "Amortization" },
  },

  forms: {
    required: "Required",
    invalidHint: {
      date: "Enter a date as dd.mm.yyyy",
      money: "Enter an amount of 0 or more, e.g. 1 250 000",
      pct: "Enter a percentage, e.g. 4,5",
      int: "Enter a whole number, e.g. 25",
      draws: "One tranche per line: dd.mm.yyyy = amount",
    },
    /** A bounded whole-number field (UX-068, ADR 0075). */
    intRange: (min: string, max: string) =>
      `Enter a whole number from ${min} to ${max}`,
    drawsPlaceholder: "dd.mm.yyyy = amount  (one tranche per line)",
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
    errRequired: "Required",
    errNameExists: "A property with this name already exists",
    errUseDate: "Use dd.mm.yyyy",
    errInvalidNumber: "Invalid number",
    errWholeNumber: "Must be a whole number",
    errInvalidPercentage: "Invalid percentage",
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
    equity: "Equity",
    ltv: "LTV",
    grossRent: "Gross rent",
    effective: "Effective",
    holding: "Holding",
    noi: "NOI",
    interest: "Interest",
    principal: "Principal",
    debtSvc: "Debt svc",
    netCf: "Net CF",
    dscr: "DSCR",
    caption: "Year-by-year projection",
  },

  about: {
    title: "About",
    subtitle: "Real Estate Tracker",
    version: (v: string) => `Version ${v}`,
    tagline: "A local-first tracker for your rental-apartment portfolio.",

    appTitle: "What this app does",
    appBody:
      "Track your rental apartments in one place: current value, debt and equity, rent, holding costs and cash flow. It projects nominal and real outcomes over your chosen horizon (30 years by default), surfaces KPIs like LTV, DSCR, yields and IRR, and lets you stress-test the portfolio with what-if scenarios.",

    privacyTitle: "Private by design",
    privacyBody:
      "Everything runs offline on your Mac. Your portfolio lives in a local SQLite database — no accounts, no cloud, no analytics. Your data never leaves the device.",

    developerTitle: "Developer",
    developerName: "Vlastimil Bureš",
    feedbackLabel: "Feedback",
    feedbackText: "github.com/vlastimilbures/real-estate-tracker/issues",
    sourceLabel: "Source",
    sourceText: "github.com/vlastimilbures/real-estate-tracker",

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
      " to clear the remaining balance over the remaining term, so the payment can step up or down at that date.",
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
      " (no principal) and the value ramps up with the fraction of the loan drawn so far. When a tranche lands or construction completes, the loan re-amortizes onto a normal repaying schedule.",
    glossaryTitle: "Glossary",
    // Definition tables
    snapshotDefs: {
      value: {
        name: "Value",
        formula: "valuation × (1 + appreciation) ^ years",
        meaning:
          "Market value, grown from the latest recorded valuation. A new valuation re-anchors the curve.",
        eg: "5.0M at 4%/yr → 5.0M × 1.04² ≈ 5.41M after 2 years.",
      },
      debt: {
        name: "Debt",
        formula: "outstanding balance on the date",
        meaning:
          "Remaining loan balance from the amortization schedule — reflects every payment and any rate reset.",
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
          "Share of the property funded by the bank. Lower = safer cushion against a price drop.",
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
