// Czech dictionary. Domain terms follow the domain-glossary skill:
// "daň z nemovitých věcí", "SVJ / fond oprav", "fixace", etc. Annotated `: Dictionary`
// so any key missing relative to en.ts is a tsc error.
import type { Dictionary } from "./en";
import { csPlural } from "./plural";
import { APP_NAME } from "./appName";

export const cs: Dictionary = {
  common: {
    /** A KPI with no value, e.g. a levered IRR (UX-079). */
    notApplicable: "n/a",
    irrNotUnique:
      "IRR není jednoznačné: peněžní toky mají nulovou současnou hodnotu při více sazbách",
    irrNoRoot: "IRR neleží mezi −90 % a +1000 %",
    /** Unit shown inside year-count fields (UX-034). */
    yearsSuffix: "let",
    asOfGroup: "K datu",
    plusYears: (n) => `+${n} r.`,
    searchProperties: "Hledat nemovitosti",
    nSelected: (n) => `Vybráno: ${n}`,
    actions: "Akce",
    searchPlaceholder: "Hledat…",
    /** Short word for thousands on chart axes (UX-034). */
    thousandsShort: "tis.",
    cancel: "Zrušit",
    save: "Uložit",
    create: "Vytvořit",
    saveChanges: "Uložit změny",
    unsavedTitle: "Zahodit neuložené změny?",
    unsavedBody: "Změny na této stránce nejsou uložené.",
    discardChanges: "Zahodit změny",
    unsavedChanges: "Neuložené změny",
    allChangesSaved: "Všechny změny uloženy",
    saveFailedKept: "Uložení selhalo — zadané hodnoty zůstaly",
    fieldsNeedAttention: (n) =>
      `${n} ${csPlural(n, ["pole vyžaduje", "pole vyžadují", "polí vyžaduje"])} pozornost:`,
    keepEditing: "Pokračovat v úpravách",
    edit: "Upravit",
    delete: "Smazat",
    yesDelete: "Ano, smazat",
    confirmDeleteRow: "Smazat tento záznam?",
    deleting: "Mazání…",
    staleData:
      "Změna se možná ještě nezobrazuje: načtení dat selhalo. Načtěte znovu, abyste viděli uložený stav.",
    reload: "Načíst znovu",
    saving: "Ukládání…",
    close: "Zavřít",
    dismiss: "Zavřít",
    noneYet: "Zatím nic.",
    today: "Dnes",
    all: "Vše",
    addVerb: "Přidat",
    asOfLabel: "K datu",
    asOfHintProjection: (year, period) =>
      `Budoucí datum ukazuje nejbližší rok projekce (${year}, ${period})`,
    asOfHintSnapshot: (d) => `Zobrazeny záznamy platné k ${d}`,
    noPortfolioTitle: "Zatím žádné portfolio",
    noPortfolioBody: "Začněte přidáním nemovitosti nebo importem souborů CSV.",
    allInactiveTitle: (n) =>
      csPlural(n, [
        "Jediná nemovitost je deaktivovaná",
        `Všechny ${n} nemovitosti jsou deaktivované`,
        `Všech ${n} nemovitostí je deaktivováno`,
      ]),
    allInactiveBody:
      "Záznamy zůstávají uložené. Čísla zahrnují jen aktivní nemovitosti: otevřete nemovitost a zvolte Aktivovat.",
    openProperties: "Otevřít Nemovitosti",
    importCsv: "Importovat CSV",
    nominal: "Nominální",
    real: "Reálné",
    nominalLower: "nominálně",
    realLower: "reálně",
  },

  app: {
    loadingEyebrow: APP_NAME,
    loading: "Načítání portfolia…",
    dbErrorEyebrow: "Nepodařilo se otevřít databázi",
    bootRetryHint:
      "Zkuste to znovu; pokud to stále selhává, ukončete a znovu otevřete aplikaci a uschovejte soubor protokolu pro diagnostiku.",
    tryAgain: "Zkusit znovu",
  },

  inputRules: {
    INVALID_DATE: "Neplatné datum",
    NON_FINITE_NUMBER: "Není konečné číslo",
    NEGATIVE_AMOUNT: "Nesmí být záporné",
    NEGATIVE_PRINCIPAL: "Jistina úvěru nesmí být záporná",
    RATE_OUT_OF_RANGE: "Musí být podíl od nuly do jedné",
    INSTALMENT_BELOW_INTEREST:
      "Měsíční splátka nepokryje měsíční úrok, úvěr by se nikdy nesplatil",
    ZERO_RATE_ZERO_INSTALMENT:
      "Při nulové úrokové sazbě musí být splátka vyšší než nula",
    MISSING_TERM_FOR_DEV_LOAN:
      "Úvěr s čerpáním nebo obdobím splácení jen úroků potřebuje dobu splatnosti",
    NON_POSITIVE_DRAW: "Každé čerpání musí být vyšší než nula",
    DRAW_BEFORE_START:
      "Čerpání musí mít datum po začátku úvěru; částka čerpaná v den začátku patří do počáteční jistiny",
    DRAW_AFTER_SCHEDULE_END:
      "Čerpání musí mít datum nejpozději v den předposlední splátky úvěru (začátek plus doba splatnosti bez jednoho měsíce)",
    COMPLETION_BEFORE_START: "Konec splácení jen úroků je před začátkem úvěru",
    DUPLICATE_BLOCK_START:
      "Tato nemovitost už má hypotéku začínající ve stejný den",
    END_BEFORE_START: "Datum konce je před datem začátku",
    DUPLICATE_HOLDING_COST:
      "Nemovitost má více než jeden záznam nákladů držení",
    ORPHAN_ROW: "Záznam patří k nemovitosti, která neexistuje",
    HORIZON_NOT_POSITIVE: "Horizont projekce musí být alespoň jeden rok",
    INVALID_TERM: "Doba v letech není platná",
    SHOCK_OUT_OF_RANGE: "Šok scénáře je mimo povolený rozsah",
    GROWTH_OUT_OF_RANGE: "Musí být vyšší než −100 %",
    SHOCKED_RATE_OUT_OF_RANGE:
      "Sazba po skončení fixace plus šok sazby musí zůstat od 0 % do 100 %",
    SHOCKED_INFLATION_OUT_OF_RANGE:
      "Inflace plus inflační šok musí zůstat vyšší než −100 %",
    ASOF_BEFORE_BASEDATE: "Datum je před výchozím datem",
    NON_POSITIVE_PREPAYMENT: "Každá mimořádná splátka musí být vyšší než nula",
    EVENT_BEFORE_START:
      "Mimořádná splátka nebo změna splatnosti musí mít datum po začátku úvěru",
    EVENT_AFTER_SCHEDULE_END:
      "Mimořádná splátka nebo změna splatnosti musí mít datum před poslední splátkou úvěru",
    INVALID_RECAST:
      "Změna splatnosti potřebuje buď nové datum splatnosti, nebo novou splátku vyšší než nula, ne obojí",
    INVALID_RECAST_MATURITY:
      "Nová splatnost musí být po příští splátce a u úvěru na výstavbu po dokončení, a nejvýše 50 let od začátku úvěru (nebo smluvní doba, je-li delší)",
    RECAST_INSTALMENT_BEFORE_COMPLETION:
      "Novou splátku lze nastavit až po skončení splácení jen úroků; zadejte místo toho nové datum splatnosti",
  },

  writeErrors: {
    duplicatePropertyName: "Nemovitost s tímto názvem už existuje",
    duplicateValuationDate: "Tato nemovitost už má ocenění od tohoto data",
    duplicateLeaseStart: "Tato nemovitost už má nájem začínající tímto datem",
    duplicateId:
      "Záznam se stejným interním identifikátorem už existuje, nic se nezměnilo",
    invalidFlag: "Hodnota ano/ne není platná",
    invalidJson: "Uloženou hodnotu nelze přečíst",
    missingValue: "Chybí povinná hodnota",
    otherConstraint: "Databáze změnu odmítla, nic se nezměnilo",
    scenarioBreaks: (name, rule) =>
      `Tato hodnota by porušila scénář „${name}“. ${rule}. Změňte hodnotu, nebo nejdřív upravte scénář`,
  },

  dataErrors: {
    DB_INTEGRITY:
      "Soubor databáze neprošel kontrolou integrity. Nic nebylo změněno.",
    DB_NEWER:
      "Tuto databázi uložila novější verze aplikace. Nic nebylo změněno. Otevřete ji v té verzi.",
    MIGRATION_CONFLICT:
      "Aktualizace databáze se zastavila dříve, než cokoli změnila: některé uložené záznamy jsou v rozporu s novými pravidly. Opravte je v předchozí verzi aplikace a pak otevřete tuto verzi znovu.",
    MIGRATION_BACKUP_FAILED:
      "Aktualizace databáze nezačala, protože bezpečnostní zálohu se nepodařilo zapsat nebo ověřit. Nic nebylo změněno. Zkontrolujte volné místo na disku a otevřete aplikaci znovu.",
    MIGRATION_FAILED:
      "Aktualizace databáze selhala a byla vrácena zpět. Nic nebylo změněno; předchozí verze aplikace tuto databázi stále otevře.",
    ROW_INVALID:
      "Uložený záznam obsahuje hodnotu, kterou aplikace nedokáže přečíst. Nic nebylo změněno.",
    ROW_MISSING: "Záznam již neexistuje. Nic nebylo změněno.",
    SCENARIO_INVALID: "Uložený scénář nelze přečíst. Nic nebylo změněno.",
    detailsHeading: "Dotčené záznamy",
    logHint:
      "Podrobnosti jsou v protokolu aplikace: ~/Library/Logs/com.bures.realestate-tracker/app.log",
  },

  // The startup error screen (#115, ADR 0153).
  boot: {
    partialConflict: (reached: number, stoppedAt: number) =>
      `Aktualizace databáze se zastavila u verze ${stoppedAt}: některé uložené záznamy jsou v rozporu s novými pravidly. Předchozí kroky proběhly, takže databáze je teď ve verzi ${reached} a předchozí verze aplikace ji už neotevře.`,
    partialFailed: (reached: number, stoppedAt: number) =>
      `Aktualizace databáze selhala u verze ${stoppedAt} a tento krok byl vrácen zpět. Předchozí kroky proběhly, takže databáze je teď ve verzi ${reached} a předchozí verze aplikace ji už neotevře.`,
    copyAt: (file: string) =>
      `Kopie z doby před aktualizací je ve složce záloh: ${file}. Chcete-li se vrátit k předchozí verzi aplikace, ukončete aplikaci, přesuňte portfolio.db, portfolio.db-wal a portfolio.db-shm stranou (některé nemusí existovat) a na místo portfolio.db dejte kopii tohoto souboru přejmenovanou na portfolio.db.`,
    partialNew: (reached: number, stoppedAt: number) =>
      `Zakládání nové databáze se zastavilo u verze ${stoppedAt}; databáze je ve verzi ${reached} a zatím neobsahuje žádná data. Zkuste to znovu.`,
    nextIntegrity:
      "Ukončete aplikaci a přesuňte portfolio.db, portfolio.db-wal a portfolio.db-shm ze složky dat (nemažte je; některé nemusí existovat). Pak buď znovu otevřete aplikaci, která se spustí s novou databází s ukázkovým portfoliem, a obnovte poslední zálohu JSON v Nastavení → Záloha a obnova; nebo ještě před otevřením dejte do složky dat kopii souboru před migrací ze složky záloh, přejmenovanou na portfolio.db.",
    nextRowInvalid:
      "Obnovit zálohu… nahradí všechna data zálohou JSON; bezpečnostní kopie současných dat se uloží nejdřív. Nebo nahlaste záznam níže.",
    restoreBackup: "Obnovit zálohu…",
    restoredReloadFailed: (file: string) =>
      `Záloha byla obnovena a vaše předchozí data byla uložena jako ${file} ve složce záloh, ale data se nepodařilo načíst. Zkuste to znovu; pokud to stále selhává, uschovejte soubor protokolu pro diagnostiku.`,
    continue: "Otevřít aplikaci",
    detailsOther: "Podrobnosti",
    showDataFolder: "Zobrazit složku dat",
    revealFailed:
      "Složku se nepodařilo otevřít. Najdete ji zde: ~/Library/Application Support/com.bures.realestate-tracker/",
  },

  errorBoundary: {
    title: "Na této obrazovce došlo k chybě",
    tryAgain: "Zkusit znovu",
    invalidDataTitle:
      "Některá uložená data porušují pravidlo, které výpočty potřebují",
    invalidDataBody:
      "Opravte níže uvedený záznam; čísla na této obrazovce se vrátí, jakmile bude platný.",
    openProperty: "Otevřít nemovitost",
    assumptionsRecord: "Předpoklady",
    unknownRecord: "Záznam",
  },

  monthsShort: [
    "led",
    "úno",
    "bře",
    "dub",
    "kvě",
    "čvn",
    "čvc",
    "srp",
    "zář",
    "říj",
    "lis",
    "pro",
  ],

  calendar: {
    open: "Otevřít kalendář",
    weekStartsOn: 1,
    weekdaysShort: ["ne", "po", "út", "st", "čt", "pá", "so"],
  },

  nav: {
    dashboard: "Přehled",
    properties: "Nemovitosti",
    projections: "Projekce",
    scenarios: "Scénáře",
    guide: "Průvodce",
    importData: "Import",
    settings: "Nastavení",
  },

  menu: {
    about: `O aplikaci ${APP_NAME}`,
    settings: "Nastavení…",
    newProperty: "Nová nemovitost…",
  },

  charts: {
    table: "Tabulka",
    surfaceLabel: (title: string) =>
      `${title} — graf. Hodnoty zobrazí tlačítko Tabulka.`,
  },

  shell: {
    offline: "Offline · lokální",
    skipToContent: "Přeskočit na obsah",
    backupHintNone: "Zatím žádná záloha. Exportovat",
    backupHintOld: (days: number) =>
      `Poslední záloha před ${days} ${csPlural(days, ["dnem", "dny", "dny"])}. Exportovat`,
    dismissBackupHint: "Skrýt připomínku zálohy",
    baseDate: (d) => `Začátek projekce ${d}`,
    expandSidebar: "Rozbalit panel",
    collapseSidebar: "Sbalit panel",
    appearance: "Vzhled",
    nominalOrReal: "Nominální nebo reálné hodnoty",
    language: "Jazyk",
    themeLight: "Světlý",
    themeDark: "Tmavý",
    themeSystem: "Systém",
    themeTitle: (cur, next) => `Motiv: ${cur} — klikněte pro ${next}`,
    themeAria: (cur, next) => `Motiv: ${cur}. Přepnout na ${next}`,
  },

  dashboard: {
    title: "Přehled",
    subtitleDefault: "Přehled portfolia",
    subFilter: (n, total) => `${n} z ${total} nemovitostí`,
    asOf: (d) => `k ${d}`,
    netWorth: "Čisté jmění",
    netWorthInYear: (endYear, n) =>
      `Čisté jmění v roce ${endYear} (horizont ${n} ${csPlural(n, ["rok", "roky", "let"])})`,
    assetsDebtEquity: (assets, debt) =>
      `Aktiva ${assets} · Dluh ${debt} · Kapitál v Kč`,
    realTodayKc: " · reálně (Kč k základnímu datu)",
    multipleFromStartMode: (mult, mode) =>
      `${mult} od začátku projekce · ${mode}`,
    leveredIrr: "Pákové IRR",
    irrFoot: (n, mode) =>
      `${n} ${csPlural(n, ["rok", "roky", "let"])} · po dluhu · ${mode}`,
    portfolioLtv: "LTV portfolia",
    badgeConservative: "Konzervativní",
    badgeModerate: "Střední",
    badgeHigh: "Vysoké",
    debtOverValue: "Dluh ÷ hodnota",
    portfolioDscr: "DSCR portfolia",
    badgeCoversDebt: "Pokrývá dluh",
    badgeShortfall: "Schodek",
    noiOverDebtService: "NOI ÷ dluhová služba",
    netYieldCap: "Čistý výnos (cap rate)",
    grossYieldFoot: (v) => `Hrubý výnos ${v}`,
    annualNetCashFlow: "Roční čistý cash flow",
    noiMinusDebtService: "NOI − dluhová služba, aktuálně",
    noiMinusDebtServiceYear: (year) =>
      `NOI − dluhová služba, rok projekce ${year}`,
    noiMinusDebtServiceOn: (d) => `NOI − dluhová služba, k ${d}`,
    currentMonthlyCashFlow: "Aktuální měsíční cash flow",
    monthlyCashFlowOn: (d) => `Měsíční cash flow k ${d}`,
    monthlyEquivalentYear: (year, period) =>
      `Měsíční ekvivalent — rok projekce ${year} (${period})`,
    monthlyHint: (d) => `roční běžný stav ÷ 12, nájemní smlouvy platné k ${d}`,
    monthlyHintProjection: "roční projekce ÷ 12",
    inflowLabel: "Příjem · efektivní nájem",
    outflowLabel: "Výdaj · náklady + dluhová služba",
    netCashFlowBaseline: "Čistý cash flow · základ",
    trajectory: (n) => `${n}letá trajektorie`,
    realTerms: "Reálné hodnoty (Kč k základnímu datu)",
    nominalKc: "Nominální Kč",
    chartValueVsDebtVsEquity: "Hodnota vs dluh vs kapitál",
    chartEquityChange: "Změna kapitálu podle roku",
    subEquityChange: "zhodnocení + splátka dluhu",
    chartNetCashFlowByYear: "Čistý cash flow podle roku",
    chartRentGrossVsEffective: "Nájem — hrubý vs efektivní",
    chartNoiVsDebtService: "NOI vs dluhová služba",
    chartLoanToValue: "Poměr dluhu k hodnotě (LTV)",
    subNetCashFlow: "zeleně kladné, červeně záporné",
    subLtv: "% — klesá s umořováním dluhu",
    seriesValue: "Hodnota",
    seriesDebt: "Dluh",
    seriesEquity: "Kapitál",
    seriesAppreciation: "Zhodnocení",
    seriesDebtPaydown: "Splátka dluhu",
    seriesDebtDrawn: "Čerpání dluhu",
    seriesNetEquityChange: "Čistá změna",
    seriesGross: "Hrubý",
    seriesEffective: "Efektivní",
    seriesNoi: "NOI",
    seriesDebtService: "Dluhová služba",
    seriesNetCashFlow: "Čistý cash flow",
    seriesLtv: "LTV",
    kpiTitle: "Klíčové ukazatele",
    kpiHintNominal: "nominální hodnoty",
    kpiHintReal: "reálné hodnoty (Kč k základnímu datu)",
    kpiNetWorthAtHorizon: "Čisté jmění na horizontu",
    kpiNetWorthMultiple: "Násobek čistého jmění",
    kpiNetWorthCagr: "CAGR čistého jmění",
    kpiLeveredIrr: "Pákové IRR",
    kpiCumulativeNetCashFlow: (n) =>
      `Kumulativní čistý cash flow (roky 1–${n})`,
    kpiFirstCfPositiveYear: "První rok s kladným cash flow",
    kpiDebtFullyRepaid: "Dluh plně splacen",
    kpiSumPrincipalRepaid: (n) => `Σ splacené jistiny (roky 1–${n})`,
    kpiSumPrincipalRepaidNominal: (n) =>
      `Σ splacené jistiny (roky 1–${n}, nominálně)`,
    kpiWeightedAvgRate: "Vážená průměrná úroková sazba",
    kpiCashInvested: "Vložené vlastní zdroje",
    kpiCashInvestedNominal: "Vložené vlastní zdroje (nominálně)",
    // Panel Financování a termíny (ADR 0103).
    financingTitle: "Financování a termíny",
    financingHint: (d) => `modelová data k ${d}`,
    financingNextReset: "Příští změna sazby",
    financingNextResetNone: "Žádná v dohledu",
    financingBalanceAtReset: "Dluh při této změně",
    financingBalanceAtResetNominal: "Dluh při této změně (nominálně)",
    financingResettingWithin: (n) =>
      `Dluh se změnou sazby do ${n} ${csPlural(n, ["roku", "let", "let"])}`,
    financingResettingWithinNominal: (n) =>
      `Dluh se změnou sazby do ${n} ${csPlural(n, ["roku", "let", "let"])} (nominálně)`,
    financingLoans: (n) => `${n} ${csPlural(n, ["úvěr", "úvěry", "úvěrů"])}`,
    financingWindow: "Období změny sazby",
    financingWindowOption: (n) => `${n} r.`,
    financingTotalInterest: (n) => `Úroky celkem (roky 1–${n})`,
    financingTotalInterestReal: (n) => `Úroky celkem (roky 1–${n}, reálně)`,
    financingInterestSaved:
      "Úrok ušetřený mimořádnými splátkami za zbývající dobu splácení úvěrů (nominálně)",
    financingInterestSavedByProperty: "Podle nemovitosti",
    financingInterestSavedNa:
      "n/a: změna splatnosti závisí na mimořádné splátce",
    financingUpcoming: "Příštích 12 měsíců",
    financingNoEvents: "Model v příštích 12 měsících nic neočekává.",
    financingMoreEvents: (n) => `+ dalších ${n}`,
    financingNoLoans: "V tomto výběru není žádná hypotéka.",
    financingEventFixationEnd: "Konec fixace",
    financingEventLoanPayoff: "Úvěr splacen",
    financingEventDevCompletion: "Konec splácení jen úroků (dokončení)",
    financingEventLeaseEnd: "Konec nájmu, další nájem nezadán",
    financingDisclaimer:
      "Data vycházejí z modelu podle zadaných úvěrů a nájmů. Nejsou to termíny banky; přesná data si ověřte u banky.",
  },

  // Kontrola dat (ADR 0118).
  dataCheck: {
    title: "Kontrola dat",
    summary: (attention, defaults) =>
      `k řešení: ${attention} · výchozí hodnoty portfolia: ${defaults}`,
    attentionTitle: "Vyžaduje pozornost",
    attentionNone: "Nic nevyžaduje pozornost.",
    defaultsTitle: "Výchozí hodnoty portfolia",
    asOfNote: (date) => `Zkontrolováno k ${date}.`,
    show: "Zobrazit kontrolu dat",
    hide: "Skrýt kontrolu dat",
    goTo: (section) => `Přejít do sekce ${section}`,
    valuationStale: (age, date) =>
      `Použité ocenění je staré ${age} (${date}). Hodnota, vlastní kapitál a LTV vycházejí z něj.`,
    noValuation: (price) =>
      `Není zadané žádné ocenění, proto se jako tržní hodnota použije kupní cena ${price}.`,
    noLease: (date) =>
      `K ${date} neplatí žádný nájem, proto se nájemné počítá jako 0.`,
    leaseEnded: (date) =>
      `Nájem skončil ${date} a další nájem není zadán. Snímek po tomto datu nepočítá žádné nájemné; projekce počítá s prodloužením tohoto nájmu.`,
    leaseEnding: (date) =>
      `Nájem končí ${date} a další nájem není zadán. Projekce počítá s prodloužením stávajícího nájmu.`,
    growthBoth: "Používá zhodnocení a indexaci nájmu z předpokladů portfolia.",
    growthAppreciation: "Používá zhodnocení z předpokladů portfolia.",
    growthRentIndexation: "Používá indexaci nájmu z předpokladů portfolia.",
    costDefaults: (fields) =>
      `Náklady na držbu používají výchozí hodnoty portfolia pro: ${fields}.`,
    fundingUnknown:
      "Vlastní zdroje vložené při koupi nejsou zadané, takže údaj „Vložené vlastní zdroje“ není znám.",
    fundingUnknownFuture:
      "Vlastní zdroje na tento nákup nejsou zadané, takže údaj „Vložené vlastní zdroje“ není znám a projekce platbu při koupi odvodí: cena minus úvěr plus zadané transakční náklady a úpravy.",
    recordFunding: "Zadat financování",
    outOfRangeSize: (value, range) =>
      `Plocha ${value} m² je mimo rozsah, který formuláře přijímají (${range} m²).`,
    outOfRangeFixation: (date, value, range) =>
      `Hypotéka od ${date}: doba fixace ${value} je mimo rozsah, který formuláře přijímají (${range} let).`,
    outOfRangeTerm: (date, value, range) =>
      `Hypotéka od ${date}: doba splatnosti ${value} je mimo rozsah, který formuláře přijímají (${range} let).`,
    outOfRangeHorizon: (value, range) =>
      `Horizont projekce ${value} je mimo rozsah, který formuláře přijímají (${range} let).`,
    earlyDate: (record, date, floor) =>
      `${record} ${date} je před ${floor}, nejstarším datem, které formuláře přijímají. Zkontrolujte překlep v roce.`,
    earlyDateRecord: {
      property: "Datum nákupu",
      mortgage: "Datum u hypotéky",
      valuation: "Datum ocenění",
      lease: "Datum nájmu",
      assumptions: "Výchozí datum",
    },
    assumptions: "Předpoklady",
  },

  properties: {
    title: "Nemovitosti",
    subtitle: (n) => `${n} ${csPlural(n, ["byt", "byty", "bytů"])}`,
    asOf: (d) => `k ${d}`,
    asOfProjection: (d, year, period) =>
      `k ${d} (rok projekce ${year}, ${period})`,
    unitsNote: "částky v Kč, toky za rok",
    addProperty: "Přidat nemovitost",
    emptyTitle: "Žádné nemovitosti",
    emptyBody:
      "Přidejte první nemovitost, nebo importujte data ze souborů CSV.",
    colProperty: "Nemovitost",
    colValue: "Hodnota",
    colDebt: "Dluh",
    colEquity: "Kapitál",
    colLtv: "LTV",
    colNoi: "NOI",
    colNetCashFlow: "Čistý cash flow",
    colDscr: "DSCR",
    badgePending: "Čeká",
    pendingPurchaseOn: (d) => `koupě ${d}`,
    badgeInactive: "Neaktivní",
    editProperty: "Upravit nemovitost",
    deleteProperty: "Smazat nemovitost",
    confirmDelete: (name) =>
      `Smazat ${name} a všechny propojené hypotéky, ocenění, nájmy a náklady na držbu? Tuto akci nelze vrátit.`,
  },

  propertyDetail: {
    fallbackTitle: "Nemovitost",
    noneSelectedTitle: "Není vybrána žádná nemovitost",
    backToProperties: "Zpět na nemovitosti",
    allProperties: "‹ Všechny nemovitosti",
    purchased: (d) => `koupeno ${d}`,
    pendingPurchase: (d) => `čeká — koupě ${d}`,
    notOwnedTitle: "Zatím není ve vlastnictví",
    notOwnedHint: "Čísla začínají koupí; do té doby grafy ukazují 0.",
    asOf: (d) => `k ${d}`,
    deactivated: "deaktivováno",
    deactivate: "Deaktivovat",
    deactivating: "Deaktivace…",
    yesDeactivate: "Ano, deaktivovat",
    activate: "Aktivovat",
    activating: "Aktivace…",
    deactivateTitle: "Vyřadit tuto nemovitost z přehledů a projekcí",
    activateTitle: "Znovu zahrnout tuto nemovitost do přehledů a projekcí",
    confirmDeactivate: (name) =>
      `Deaktivovat ${name}? Bude vyřazena z přehledů a projekcí, dokud ji znovu neaktivujete. Žádná data se nesmažou. Deaktivace nezaznamená prodej, výnos z prodeje ani splacení úvěru.`,
    confirmDeleteValuation: (date) => `Smazat ocenění od ${date}?`,
    confirmDeleteLease: (date) => `Smazat nájem od ${date}?`,
    confirmDeleteMortgage: (date) => `Smazat hypoteční blok od ${date}?`,
    inactiveBadge: "Neaktivní",
    inactiveNote:
      "Tato nemovitost je vyřazena z přehledů a projekcí portfolia.",
    inactivePreviewNote: "Čísla níže ji ukazují, jako by byla stále aktivní.",
    sizeM2: (n) => `${n} m²`,
    marketValue: "Tržní hodnota",
    debt: "Dluh",
    equity: "Kapitál",
    dscr: "DSCR",
    ltv: "LTV",
    netCf: "Čistý CF",
    chartValueVsDebtVsEquity: "Hodnota vs dluh vs kapitál",
    chartNetCashFlowByYear: "Čistý cash flow podle roku",
    subMKcMode: (mode) => mode,
    seriesValue: "Hodnota",
    seriesDebt: "Dluh",
    seriesEquity: "Kapitál",
    seriesNetCashFlow: "Čistý cash flow",
    valuationsTitle: "Ocenění",
    valuationsHint:
      "tržní hodnoty s platností k datu — u developerské nemovitosti jde o dokončenou (cílovou) hodnotu; zobrazená hodnota roste s čerpáním hypotéky",
    addValuation: "ocenění",
    colValidFrom: "Platné od",
    colValidTo: "Platné do",
    colMarketValue: "Tržní hodnota",
    leasesTitle: "Nájmy",
    leasesHint: "zobrazený nájem určuje smlouva platná k datu „K datu“",
    addLease: "nájem",
    colStart: "Začátek",
    colEnd: "Konec",
    colMonthlyRent: "Měsíční nájem",
    mortgagesTitle: "Hypoteční bloky",
    mortgagesHint: "konec fixace resetuje sazbu a znovu umořuje",
    addMortgage: "hypoteční blok",
    colInitialPrincipal: "Počáteční jistina",
    colFixation: "Fixace",
    colTerm: "Doba",
    colRate: "Sazba",
    colInstalment: "Splátka",
    colDevelopment: "Development",
    yrs: (n) => `${n} ${csPlural(n, ["rok", "roky", "let"])}`,
    auto: "auto",
    draws: (n) => `${n} čerpání`,
    ioUntil: (d) => `IO→${d}`,
    closePrevValuationTitle: "Ukončit předchozí ocenění?",
    closePrevValuationBody: (from, end) =>
      `Ocenění od ${from} nemá datum konce. Ukončit ho ${end}, den před začátkem nového?`,
    closePrevLeaseTitle: "Ukončit předchozí nájem?",
    closePrevLeaseBody: (from, end) =>
      `Nájem od ${from} nemá datum konce. Ukončit ho ${end}, den před začátkem nového?`,
    closePrevConfirm: "Ukončit předchozí",
    closePrevKeep: "Ponechat",
    instalmentHint: (years, amount) =>
      `Anuitní splátka na ${years} ≈ ${amount}`,
    instalmentHintDev: (base) =>
      `${base} — pro počáteční jistinu; přepočítá se při každém čerpání a při dokončení. Doba splatnosti je povinná.`,
    devTermNeeded:
      "Developerský úvěr — zadejte dobu splatnosti v letech; u čerpání a období jen úroků je povinná.",
    calc: "Spočítat",
    calcTitle: (years) => `Spočítat splátku na ${years}`,
    calcDisabled: "Nejdřív zadejte jistinu a úrokovou sazbu",
    fieldValidFrom: "Platné od",
    fieldValidTo: "Platné do",
    fieldMarketValue: "Tržní hodnota",
    fieldStartDate: "Datum začátku",
    fieldEndDate: "Datum konce",
    fieldMonthlyRent: "Měsíční nájem",
    fieldInitialPrincipal: "Počáteční jistina",
    fieldFixationYears: "Fixace (roky)",
    fieldLoanTermYears: "Doba splatnosti (roky)",
    helpLoanTermYears:
      "prázdné = odvodit ze splátky; povinné u developerských úvěrů",
    fieldInterestRate: "Úroková sazba p.a.",
    fieldMonthlyInstalment: "Měsíční splátka",
    fieldDraws: "Developerská čerpání (po startu)",
    helpDraws:
      "DALŠÍ tranše čerpané PO datu startu — jedna na řádek: dd.mm.yyyy = částka. První čerpání je pole Počáteční jistina (zde ho neopakujte). Celkový úvěr = počáteční jistina + tato čerpání; hodnota nemovitosti roste s kumulativním čerpáním ÷ celková jistina.",
    fieldCompletionDate: "Pouze úroky do (dokončení)",
    helpCompletionDate: "do tohoto data platit jen úroky, poté znovu umořovat",
    loanType: "Typ úvěru",
    loanTypeStandard: "Standardní",
    loanTypeDevelopment: "Developerský (výstavba)",
    loanTypeClearWarning: "Standardní typ smaže čerpání a datum dokončení.",
    loanTypeClearAndSwitch: "Smazat a přepnout",
    loanTypeKeepDevelopment: "Ponechat developerský",
    successorNote:
      "Nový blok nahradí současný od svého data začátku (refixace nebo refinancování). Aplikace počítá s jedním aktivním úvěrem na nemovitost.",
    successorLearnMore: "Více informací",
    holdingCostsTitle: "Náklady na držbu",
    holdingCostsHint: "nechte prázdné pro globální výchozí hodnotu",
    fieldPropertyTax: "Daň z nemovitosti /rok",
    fieldInsurance: "Pojištění /rok",
    fieldSvjMo: "SVJ /měs",
    fieldOther: "Ostatní /rok",
    fieldMgmtPct: "Správa (% nájmu)",
    fieldMaintPct: "Údržba (% nájmu)",
    saveHoldingCosts: "Uložit náklady na držbu",
    holdingCostsSaved: "Náklady na držbu uloženy",
    projectionTitle: (n) => `${n}letá projekce`,
    amortizationWarn:
      "Měsíční splátka tento úvěr do konce doby splatnosti nesplatí.",
    eventIssue: {
      PREPAYMENT_EXCEEDS_BALANCE: (date, requested, applied) =>
        `mimořádná splátka ${requested} k ${date} je vyšší než zůstatek: splatí ${applied} a úvěr doplatí.`,
      PREPAYMENT_AFTER_PAYOFF: (date) =>
        `mimořádná splátka k ${date} připadá po doplacení úvěru, proto se nepoužije.`,
      PREPAYMENT_REPLACED: (date) =>
        `mimořádná splátka k ${date} připadá po převzetí dalším úvěrovým blokem, proto se nepoužije.`,
      RECAST_AFTER_PAYOFF: (date) =>
        `změna splatnosti k ${date} připadá po doplacení úvěru, proto se nepoužije.`,
      RECAST_REPLACED: (date) =>
        `změna splatnosti k ${date} připadá po převzetí dalším úvěrovým blokem, proto se nepoužije.`,
      RECAST_INSTALMENT_BELOW_INTEREST: (date) =>
        `nová splátka od ${date} nepokryje úrok, proto úvěr zůstává na původních podmínkách.`,
      RECAST_TERM_CAPPED: (date) =>
        `nová splátka od ${date} by překročila nejdelší povolenou splatnost, proto se úvěr přepočítá na tuto splatnost.`,
    },
    loanSummaryTitle: "Výhled úvěru",
    loanSummaryHint:
      "modelováno z úvěrů, mimořádných splátek a změn splatnosti",
    loanPayoff: "Modelované doplacení",
    loanPayoffNone: "Splaceno",
    interestSaved: "Úrok ušetřený mimořádnými splátkami (nominálně)",
    interestSavedNa: "n/a: změna splatnosti závisí na mimořádné splátce",
    remainingTerm: "Zbývající doba splácení",
    outlookResetsTitle: "Konce fixace podle úvěrových bloků",
    colFixationEnd: "Konec fixace",
    colBalanceAtReset: "Dluh při změně sazby (nominálně)",
    colStatus: "Stav",
    outlookStatus: {
      nextReset: "Příští změna sazby",
      upcoming: "Nadcházející",
      passed: "Fixace skončila",
      replaced: "Nahrazen pozdějším úvěrem",
      repaid: "Splacen před koncem fixace",
      floating: "Plovoucí sazba",
    },
    loanSummaryNote:
      "Data doplacení a konců fixace jsou modelovaná, nejsou to termíny od banky, a dluh při změně sazby je nominální. Ušetřený úrok porovnává úvěr s mimořádnými splátkami a bez nich, za celou zbývající dobu.",
    loanFrom: (date) => `Úvěr od ${date}:`,
    monthsCount: (n) => `${n} ${csPlural(n, ["měsíc", "měsíce", "měsíců"])}`,
    maturityPaysOff: (instalment, implied) =>
      `Splátka ${instalment} úvěr doplatí ${implied},`,
    maturityAfter: (months, contract) =>
      `${months} po splatnosti podle smlouvy ${contract}.`,
    maturityBefore: (months, contract) =>
      `${months} před splatností podle smlouvy ${contract}.`,
    maturityCheck: "Zkontrolujte splátku nebo datum splatnosti.",
    fixationEnded: (end, rate) =>
      `Fixace skončila ${end} a není zadán navazující blok, proto aplikace od té doby počítá s resetovací sazbou ${rate}. Zadejte podmínky refixace jako nový blok hypotéky.`,
    fixationEndedUntil: (end, until, rate) =>
      `Fixace skončila ${end} a další blok začíná až ${until}, proto aplikace počítá s resetovací sazbou ${rate} od ${end} do ${until}. Zadejte podmínky pro toto období jako blok hypotéky.`,
    fieldPrepayments: "Mimořádné splátky",
    helpPrepayments:
      "Mimořádné splacení jistiny k datu. Snížení splátky zachová splatnost; zkrácení splatnosti zachová splátku. Poplatek se platí z vlastních prostředků a dluh nesnižuje.",
    fieldRecasts: "Změny splatnosti",
    helpRecasts:
      "Od data úvěr běží do nového data splatnosti nebo s novou splátkou.",
    eventDate: "Datum",
    eventAmount: "Částka",
    eventEffect: "Dopad",
    eventEffectLowerInstalment: "Snížit splátku",
    eventEffectShortenTerm: "Zkrátit splatnost",
    eventFee: "Poplatek (nepovinný)",
    eventMode: "Změna",
    eventModeMaturity: "Nové datum splatnosti",
    eventModeInstalment: "Nová splátka",
    eventMaturity: "Datum splatnosti",
    eventInstalment: "Splátka",
    eventAddPrepayment: "Přidat mimořádnou splátku",
    eventAddRecast: "Přidat změnu splatnosti",
    eventPrepaymentRow: (n) => `Mimořádná splátka ${n}`,
    eventRecastRow: (n) => `Změna splatnosti ${n}`,
    eventRemove: (row) => `Odebrat: ${row}`,
    fieldContractMaturity: "Splatnost podle smlouvy",
    helpContractMaturity:
      "ze smlouvy; prázdné = nekontroluje se; u developerského úvěru se nepoužívá",
    amortizationWarnExpected: "Očekávaná splátka ≈",
    // Section nav (ADR 0107)
    sectionNavLabel: "Části nemovitosti",
    sectionOverview: "Přehled",
    sectionRecords: "Záznamy",
    sectionFinancing: "Financování",
    sectionHolding: "Náklady na držbu",
    sectionProjection: "Projekce",
    sectionAmortization: "Umořovací plán",
    // Acquisition section (ADR 0119 §9)
    sectionAcquisition: "Pořízení",
    acqTitle: "Financování koupě",
    acqHint: "jak bylo zadáno, nominálně",
    acqPrice: "Kupní cena",
    acqTransactionCosts: "Transakční náklady",
    acqInitialWorks: "Počáteční úpravy",
    acqUses: "Užití (cena + náklady + úpravy)",
    acqCashInvested: "Vložené vlastní zdroje",
    acqLoan: "Úvěr na koupi",
    acqLoanNone: "Žádný",
    acqSources: "Zdroje (vlastní zdroje + úvěr)",
    acqGapShort: (amount) =>
      `Zadané zdroje nepokrývají užití o ${amount}. Zkontrolujte vlastní zdroje, náklady a úpravy nebo úvěr.`,
    acqGapOver: (amount) =>
      `Zadané zdroje převyšují užití o ${amount}. Zkontrolujte vlastní zdroje, náklady a úpravy nebo úvěr.`,
    acqNote:
      "— znamená nezadáno; užití počítá jen zadané náklady a úpravy. Úvěr na koupi je první úvěrový blok, pokud začíná nejpozději 90 dní po koupi. Částky zadáte v dialogu „Upravit nemovitost“.",
    acqRecordedNote: (note) => `Poznámka: ${note}`,
    showAmortization: (n) =>
      `Zobrazit umořovací plán (${n} ${csPlural(n, ["splátka", "splátky", "splátek"])})`,
    hideAmortization: "Skrýt umořovací plán",
    amortizationTitle: "Umořovací plán",
    amortizationMonths: (n) =>
      `${n} ${csPlural(n, ["měsíc", "měsíce", "měsíců"])}`,
    amColMonth: "Měsíc",
    amColDate: "Datum",
    amColRate: "Sazba",
    amColInstalment: "Splátka",
    amColInterest: "Úrok",
    amColPrincipal: "Jistina",
    amColDrawn: "Čerpáno",
    amColRefinanced: "Rozdíl při refinancování",
    amColPrepaid: "Mimořádně splaceno",
    amColPrepaymentFee: "Poplatek za mimořádnou splátku",
    amColEndBalance: "Konečný zůstatek",
  },

  assumptions: {
    scenariosHint:
      "Toto jsou základní hodnoty používané na všech obrazovkách. Přepište je pro analýzu scénářů v části Scénáře.",
    saved: "Předpoklady uloženy — projekce aktualizovány",
    driversTitle: "Tržní a projekční parametry",
    defaultsTitle: "Výchozí náklady na držbu",
    defaultsHint: "použito, když nemovitost nechá pole prázdné",
    baseDate: "Základní datum",
    baseDateHelp:
      "Začátek projekce (rok 0) a cenová základna reálných hodnot. Aktuální čísla se řídí datem „K datu“, výchozí je dnešek.",
    horizon: "Horizont",
    appreciation: "Zhodnocení p.a.",
    rentIndexation: "Indexace nájmu p.a.",
    inflation: "Inflace (CPI) p.a.",
    vacancy: "Rezerva na neobsazenost",
    postFixationReset: "Sazba po skončení fixace",
    propertyTax: "Daň z nemovitosti /rok",
    insurance: "Pojištění /rok",
    svj: "SVJ / fond oprav /měs",
    other: "Ostatní /rok",
    mgmt: "Správa (% nájmu)",
    maint: "Údržba (% nájmu)",
  },

  settings: {
    title: "Nastavení",
    subtitle: "Předpoklady a záloha dat",
    tabs: {
      assumptions: "Předpoklady",
      backup: "Záloha a obnova",
    },
  },

  projections: {
    title: "Projekce",
    subtitle: (lens) => `Rok po roce · ${lens}`,
    realTerms: "reálné hodnoty",
    realTermsDated: (d) => `reálné hodnoty (Kč k začátku projekce ${d})`,
    nominalKc: "nominální Kč",
    periodNote: "toky za rok, zůstatky ke konci roku",
    portfolio: "Portfolio",
    entity: "Subjekt",
  },

  scenarios: {
    plusPp: (n) => `+${n} p. b.`,
    title: "Scénáře",
    subtitle: "Co-kdyby úpravy předpokladů — Základ je vaše uložené portfolio",
    newScenario: "Nový scénář",
    base: "Základ",
    savedAssumptions: "uložené předpoklady",
    noOverrides: "žádné úpravy",
    presetsTitle: "Stresové předvolby",
    presetsHint: (years) =>
      `Jedním klikem se uloží scénář. Šoky sazeb a inflace trvají ${years} l., pak odezní; propad cen je trvalý.`,
    showPresets: "Zobrazit předvolby",
    hidePresets: "Skrýt předvolby",
    presetsCollapsedSummary:
      "Šoky sazeb, inflace, propad cen a kombinované šoky jsou skryté.",
    atStart: "Start",
    atStartTitle: (date) => `Na začátku projekce (${date})`,
    rateShockAtRefix: "Šok sazby @ refix",
    inflationShock: "Inflační šok",
    priceCrash: "Propad cen",
    crashWhen: "Kdy",
    rateForYears: (label, years) => `Sazby ${label} na ${years} l.`,
    inflForYears: (label, years) => `Inflace ${label} na ${years} l.`,
    crashTitle: (label, suffix) => `Propad cen ${label}${suffix}`,
    crashAt: (label) => ` @ ${label}`,
    combined: "Kombinované",
    mild: "Mírný",
    severe: "Tvrdý",
    combinedTitle: (level, parts) => `${level}: ${parts}`,
    addedScenario: (name) => `Přidáno „${name}“`,
    duplicatedScenario: (name) => `Zduplikováno „${name}“`,
    alreadySaved: (name) => `Už uloženo: „${name}“`,
    addedCompareFull: (name, max) =>
      `Přidáno „${name}“. Porovnání už ukazuje ${max} scénáře, odškrtněte jeden, aby se zobrazil.`,
    duplicatedCompareFull: (name, max) =>
      `Zduplikováno „${name}“. Porovnání už ukazuje ${max} scénáře, odškrtněte jeden, aby se zobrazila kopie.`,
    confirmDelete: (name: string) =>
      `Smazat scénář „${name}“? Tuto akci nelze vrátit.`,
    deletedScenario: (name) => `Smazáno „${name}“`,
    listTitle: "Scénáře",
    listHint: (max) =>
      `Zaškrtněte až ${max} scénáře k porovnání. Základ je navíc a nepočítá se.`,
    duplicate: "Duplikovat",
    emptyList:
      "Zatím žádné uložené scénáře — použijte předvolbu nebo „Nový scénář“.",
    compareTitle: "Porovnání",
    nothingSelectedTitle: "Nic nevybráno",
    nothingSelectedBody: "Zaškrtněte Základ a/nebo scénáře výše pro porovnání.",
    keyFiguresTitle: "Klíčové údaje",
    keyFiguresHint: "nominální Kč",
    keyFiguresHintReal: "reálně (ceny k datu zahájení)",
    chartNetWorth: "Čisté jmění (kapitál)",
    chartNetCashFlow: "Čistý cash flow podle roku",
    chartLtv: "Poměr dluhu k hodnotě (LTV)",
    subPct: "%",
    kpiStartingEquity: "Počáteční kapitál",
    kpiNetWorthDeltaVsBase: "Δ čistého jmění vůči Základu",
    viewValues: "Hodnoty",
    viewDeltaVsBase: "Δ vůči Základu",
    viewToggleLabel: "Zobrazit hodnoty, nebo rozdíl vůči Základu",
    deltaYears: (n) => (n > 0 ? `+${n} r.` : n < 0 ? `−${-n} r.` : "0 r."),
    deltaNoBaseValue: "Základ nemá hodnotu",
    rebasedReturnsFootnote: (names: string) =>
      `Výnosy pro ${names} se měří od nižšího počátečního kapitálu po propadu cen; ztrátu pro vás ukazuje Δ čistého jmění vůči Základu.`,
    kpiNetWorthNominal: "Čisté jmění (nominální)",
    kpiNetWorthReal: "Čisté jmění (reálné)",
    kpiNetWorthMultiple: "Násobek čistého jmění",
    kpiCagrNominal: "CAGR (nominální)",
    kpiCagrReal: "CAGR (reálné)",
    kpiCumulativeNetCf: "Kumulativní čistý CF",
    kpiLeveredIrrNominal: "Pákové IRR (nominální)",
    kpiLeveredIrrReal: "Pákové IRR (reálné)",
    kpiFirstCfPositiveYear: "První rok kladného CF",
    kpiDebtFreeYear: "Rok bez dluhu",
    sumAppreciation: (v) => `zhodnocení ${v}`,
    sumRentIndex: (v) => `indexace nájmu ${v}`,
    sumVacancy: (v) => `neobsazenost ${v}`,
    sumResetRate: (v) => `sazba po fixaci ${v}`,
    sumInflation: (v) => `inflace ${v}`,
    sumInflationShock: (v, years) => `inflace +${v} p. b. na ${years} l.`,
    sumRateShock: (v, years) => `sazby +${v} p. b. na ${years} l.`,
    reachHits: (n, m, years) =>
      `zasáhne ${n} z ${m} ${csPlural(m, ["úvěru", "úvěrů", "úvěrů"])} (refixace ${years})`,
    reachNone: "v okně šoku se žádný úvěr nerefixuje, takže bez vlivu",
    unreadableRow:
      "Nelze přečíst, proto je vynechán. Smažte ho před exportem: zálohu, která ho obsahuje, nepůjde obnovit.",
    notCompared: (name) =>
      `Vynecháno z porovnání: „${name}“ má hodnotu mimo povolený rozsah. Upravte ho nebo smažte v seznamu.`,
    sumValueShock: (v, atYear) =>
      `hodnota −${v}${atYear ? ` @ rok${atYear}` : ""}`,
    editTitle: (name) => `Upravit „${name}“`,
    newTitle: "Nový scénář",
    formHint: "prázdné = zdědit Základ",
    name: "Název",
    namePlaceholder: "např. Recese",
    inherit: "zdědit",
    baseValue: (v) => `Základ ${v}`,
    fieldAppreciation: "Zhodnocení p.a.",
    fieldRentIndexation: "Indexace nájmu p.a.",
    fieldVacancy: "Rezerva na neobsazenost",
    fieldPostFixationReset: "Sazba po skončení fixace",
    fieldInflation: "Inflace p.a.",
    fieldInflationShock: "Inflační šok",
    fieldRateShock: "Šok sazby při refixaci",
    fieldValueCrash: "Propad hodnoty",
    forYears: "…na roky",
    atYear: "…v roce",
    ppSuffix: "p. b.",
    shockHelp:
      "Dočasné, pak odezní. Přičítá procentní body: +2 p. b. změní 4,5 % na 6,5 %.",
    rateShockHelp:
      "Začíná koncem fixace každého úvěru, pak odezní. Přičítá procentní body: +2 p. b. změní 4,5 % na 6,5 %.",
    permanentCorrection: "trvalá korekce",
    // Skupiny formuláře (ADR 0102)
    groupLevels: "Trvalé úrovně",
    groupLevelsHelp:
      "Nahradí hodnotu Základu pro celou projekci. Nemovitost s vlastní mírou růstu si ji ponechá.",
    groupShocks: "Dočasné šoky",
    groupShocksHelp:
      "Přičtou se k úrovni na zvolený počet let, pak se vrátí k trendu.",
    groupCrash: "Jednorázový propad cen",
    groupCrashHelp:
      "Jednou sníží hodnotu všech nemovitostí ve zvoleném roce; růst pak pokračuje z nižší hodnoty. Pokles zadejte jako kladné číslo: 20 = hodnoty klesnou o 20 %.",
    defaultYears: (n) => `výchozí ${n}`,
    zeroIsStart: (date) => `0 = začátek projekce (${date})`,
    none: "žádný",
  },

  importPage: {
    title: "Import",
    subtitle: "Import dat portfolia z CSV souborů",
    propertiesTitle: "Nemovitosti",
    valuationsTitle: "Ocenění",
    rentsTitle: "Nájmy / smlouvy",
    mortgagesTitle: "Hypotéky",
    chooseFile: "Vybrat soubor…",
    dropHint: "nebo sem přetáhněte CSV soubor",
    reupload: (name) => `Znovu nahrát ${name}`,
    downloadTemplate: "Stáhnout šablonu",
    rowsReady: (n) =>
      `${n} ${csPlural(n, ["řádek připraven", "řádky připraveny", "řádků připraveno"])}`,
    errorsBadge: (n) => `${n} ${csPlural(n, ["chyba", "chyby", "chyb"])}`,
    colRow: "Řádek",
    colField: "Pole",
    colError: "Chyba",
    importTitle: "Import",
    fixErrors: "Před importem opravte všechny chyby výše.",
    importSelected: "Importovat vybrané soubory",
    importing: "Importování…",
    importComplete: "Import dokončen",
    reportTitle: "Zpráva o importu",
    willAdd: (n) => `Přidá se ${n}`,
    willUpdate: (n) => `Aktualizuje se ${n}`,
    added: (n) => `Přidáno ${n}`,
    updated: (n) => `Aktualizováno ${n}`,
    unchangedCount: (n) => `${n} beze změny`,
    importScope: (total, added, updated) =>
      `Importovat ${total} ${csPlural(total, ["záznam", "záznamy", "záznamů"])} (${added} ${csPlural(added, ["nový", "nové", "nových"])}, ${updated} ${csPlural(updated, ["aktualizace", "aktualizace", "aktualizací"])})`,
    nothingToImport: "Všechny záznamy v těchto souborech jsou už aktuální.",
    confirmOverwrite: (n) =>
      `Přepsat ${n} ${csPlural(n, ["existující záznam", "existující záznamy", "existujících záznamů"])}`,
    confirmOverwriteMsg: (n) =>
      `Import změní ${n} ${csPlural(n, ["existující záznam", "existující záznamy", "existujících záznamů"])}. Zkontrolujte změny výše.`,
    confirmReplaceMsg: (n) =>
      `${n} ${csPlural(n, ["nový úvěrový blok ruší", "nové úvěrové bloky ruší", "nových úvěrových bloků ruší"])} uložené úvěrové události předchozího bloku. Zkontrolujte je výše.`,
    confirmReplace: "Přesto importovat",
    replacedEvent: (issue) => `Předchozí úvěrový blok: ${issue}`,
    noEffectNote:
      "Začíná před platným úvěrovým blokem, proto nemá na projekci žádný vliv.",
    storedEventKind: {
      prepayments: "mimořádná splátka",
      recasts: "změna splatnosti",
      draws: "čerpání",
    },
    errStoredEvent: (event, date, rule) =>
      `${rule} — uložená položka „${event}“ k ${date}. Zadává se ve formuláři hypotéky u nemovitosti, ne v CSV: nejdřív ji tam změňte nebo odstraňte, nebo v tomto souboru ponechte původní hodnotu.`,
    planChanged:
      "Data se od zobrazení náhledu změnila, proto se nic neimportovalo. Zkontrolujte aktualizovaný náhled a importujte znovu.",
    errRequired: "Povinné",
    errInvalidDate: (v) => `Neplatné datum „${v}“ — použijte YYYY-MM-DD`,
    errInvalidNumber: (v) => `Neplatné číslo „${v}“`,
    errInvalidInteger: (v) => `Neplatné celé číslo „${v}“`,
    errInvalidBoolean: (v) =>
      `Neplatná logická hodnota „${v}“ — použijte true/false, yes/no nebo 1/0`,
    errUnknownProperty: (v) => `Neznámá nemovitost „${v}“`,
    errInstalmentRequired:
      "Povinné (nebo zadejte loan_term_years pro automatický výpočet)",
    errImpossibleDate: (v) => `„${v}“ není skutečné kalendářní datum`,
    errEarlyDate: (v, floor) =>
      `„${v}“ je před ${floor}, nejstarším datem, které aplikace přijme — zkontrolujte překlep v roce`,
    errDecimalComma: (v) =>
      `„${v}“ používá desetinnou čárku — pište čísla s desetinnou tečkou a bez mezer (např. 4800000.40)`,
    errNegativeAmount: (v) => `Částka „${v}“ nesmí být záporná`,
    errRateOutOfRange: (v) =>
      `Sazba „${v}“ musí být podíl od nuly do jedné — 3,9 % zapište jako 0.039`,
    errNotPositive: (v) =>
      `„${v}“ — doba splatnosti musí být alespoň jeden rok`,
    errOutOfRange: (v, min, max) =>
      `„${v}“ musí být celé číslo od ${min} do ${max}`,
    errDuplicateKey: (firstRow) =>
      `Duplicita řádku ${firstRow} — každý záznam smí být v souboru jen jednou`,
    errMalformedRow: (expected, found) =>
      `Tento řádek má ${found} sloupců; záhlaví jich má ${expected}`,
    errBadQuotes: "Neuzavřené uvozovky na tomto řádku",
    errNotUtf8:
      "Soubor není v kódování UTF-8 (pravděpodobně Windows-1250 z Excelu) — uložte ho jako „CSV UTF-8“",
    errSemicolon:
      "Soubor je oddělený středníky — uložte ho jako „CSV UTF-8 (oddělený čárkami)“",
    errFileTooLarge: (limitMb) => `Soubor je větší než ${limitMb} MB`,
    errTooManyRows: (limit) =>
      `Soubor má více než ${limit.toLocaleString("cs")} datových řádků`,
    importRefused:
      "Nic nebylo importováno. Opravte tyto řádky a importujte znovu:",
    importFailed: (detail) =>
      `Import selhal a byl vrácen zpět — nic nebylo importováno. (${detail})`,
    previewFailed: (detail) =>
      `Soubory se nepodařilo porovnat s uloženými daty, zatím tedy nelze nic importovat. (${detail})`,
    templateFailed: (detail) => `Šablonu se nepodařilo uložit. (${detail})`,
    colFile: "Soubor",
    wholeFile: "Soubor",
  },

  backup: {
    exportTitle: "Exportovat zálohu",
    exportHint:
      "Uloží všechny nemovitosti, hypotéky, ocenění, nájmy, předpoklady a scénáře",
    exportBody:
      "Exportuje celé portfolio do verzovaného JSON souboru. Použijte pro vytvoření snímku před velkými změnami.",
    exportButton: "Exportovat zálohu…",
    lastBackup: (date: string, ago: string) =>
      `Poslední záloha: ${date} (${ago})`,
    noBackupYet: "Zatím nebyla exportována žádná záloha",
    agoToday: "dnes",
    agoDays: (n: number) => `před ${n} ${csPlural(n, ["dnem", "dny", "dny"])}`,
    agoWeeks: (n: number) =>
      `před ${n} ${csPlural(n, ["týdnem", "týdny", "týdny"])}`,
    offDevice: "Uchovávejte kopii i jinde než na tomto Macu.",
    exporting: "Exportování…",
    restoreTitle: "Obnovit ze zálohy",
    restoreHint: "Přepíše všechna aktuální data",
    restoreBody:
      "Vyberte dříve exportovaný JSON soubor k obnovení. Před přepsáním se automaticky uloží bezpečnostní záloha aktuálních dat.",
    chooseFile: "Vybrat soubor zálohy…",
    restoreFrom: (file) => `Obnovit ze souboru ${file}?`,
    restoreWarning:
      "⚠ Toto přepíše všechna aktuální data (nemovitosti, hypotéky, ocenění, nájmy, předpoklady a scénáře). Nejprve se uloží bezpečnostní záloha.",
    restoreNow: "Obnovit nyní",
    warnOutOfRange: (n) =>
      `Záloha obsahuje ${n} ${csPlural(n, ["hodnotu", "hodnoty", "hodnot"])}, ${csPlural(n, ["kterou", "které", "které"])} formuláře nepřijímají. Aplikace s ${n === 1 ? "ní" : "nimi"} počítá a Kontrola dat ${n === 1 ? "ji" : "je"} po obnovení uvede. Přesto obnovit?`,
    warningsTitle: "Hodnoty, které formuláře nepřijímají",
    restoreAnyway: "Přesto obnovit",
    restoring: "Obnovování…",
    errorTitle: "Chyba",
    savedTo: (file) => `Záloha uložena do ${file}`,
    downloaded: "Záloha stažena",
    restored: (file) =>
      `Portfolio obnoveno. Předchozí data byla uložena jako ${file} do složky backups vedle databáze.`,
    exportFailed: (detail) => `Zálohu se nepodařilo uložit. (${detail})`,
    safetyBackupFailed: (detail) =>
      `Obnova přerušena: bezpečnostní zálohu současných dat se nepodařilo uložit, nic nebylo změněno. (${detail})`,
    restoreFailed: (detail) =>
      `Obnova selhala a byla vrácena zpět — současná data jsou beze změny. (${detail})`,
    backupDate: (date) => `Exportováno ${date}`,
    olderVersion:
      "Vytvořeno starší verzí aplikace; při obnově se převede na novou.",
    holds: "Soubor obsahuje:",
    tables: {
      properties: "Nemovitosti",
      mortgage_blocks: "Hypotéky",
      valuations: "Ocenění",
      leases: "Nájmy",
      holding_costs: "Náklady držení",
      assumptions: "Předpoklady",
      scenarios: "Scénáře",
    },
    errTooLarge: (limitMb) =>
      `Soubor je větší než ${limitMb} MB, nejde tedy o zálohu této aplikace.`,
    errNotJson: "Soubor není záloha ve formátu JSON.",
    errInvalid: (detail) =>
      `Soubor není platná záloha této aplikace. (${detail})`,
    errUnreadable: (detail) =>
      `Soubor se nepodařilo přečíst. Zkontrolujte, že je disk připojený a soubor stažený. (${detail})`,
    errNewer: (detail) =>
      `Tuto zálohu vytvořila novější verze aplikace (${detail}). Obnovte ji v té verzi.`,
    errRowsInvalid:
      "Záloha obsahuje záznamy, které aplikace nemůže obnovit. Nic nebylo změněno. Dotčené záznamy:",
    colTable: "Tabulka",
    colRecord: "Záznam",
    colColumn: "Sloupec",
    colProblem: "Problém",
    issueUnreadable: "Hodnotu nelze přečíst",
    issueDuplicate: "Opakuje dřívější záznam",
    issueMissingAssumptions:
      "Soubor musí obsahovat právě jeden záznam předpokladů",
    issueOutOfRange: (min, max) => `Musí být celé číslo od ${min} do ${max}`,
    issueEarlyDate: (floor) => `Musí být datum od ${floor}`,
  },

  sample: {
    banner: "Prohlížíte si ukázkové portfolio s fiktivními byty.",
    clearAction: "Smazat ukázku a začít vlastní",
    keepExploring: "Prohlížet dál",
    dialogTitle: "Smazat ukázkové portfolio?",
    dialogDeletes:
      "Smažou se tři ukázkové byty a všechny záznamy pod nimi — hypotéky, ocenění, nájmy a náklady — včetně těch, které jste k nim přidali.",
    dialogKeeps:
      "Nemovitosti, které jste přidali sami, vaše předpoklady a scénáře zůstanou.",
    dialogBackup:
      "Nejprve se uloží bezpečnostní záloha všech současných dat do složky backups vedle databáze.",
    confirm: "Smazat ukázku",
    clearing: "Mazání…",
    cleared: (file) =>
      `Ukázka smazána. Předchozí data byla uložena jako ${file} do složky backups vedle databáze.`,
    safetyBackupFailed: (detail) =>
      `Nic nebylo smazáno: bezpečnostní zálohu současných dat se nepodařilo uložit. (${detail})`,
    clearFailed: (detail) =>
      `Smazání ukázky selhalo a bylo vráceno zpět — vaše data jsou beze změny. (${detail})`,
    panelTitle: "Ukázkové portfolio",
    panelBody:
      "Smažte ukázkové byty a začněte vlastní portfolio. Nemovitosti, které jste přidali sami, zůstanou.",
    loadHint: "Fiktivní byty pro vyzkoušení aplikace",
    loadBody:
      "Nahrajte tři fiktivní byty s hypotékami, nájmy a náklady. Vaše předpoklady zůstanou beze změny.",
    loadAction: "Nahrát ukázkové portfolio",
    loading: "Nahrávám…",
    loaded:
      "Ukázkové portfolio je nahrané. Kdykoli ho smažete zde nebo z banneru.",
    errNotEmpty:
      "Ukázku lze nahrát jen do prázdného portfolia. Nic nebylo přidáno.",
    loadFailed: (detail) =>
      `Nahrání ukázky selhalo a bylo vráceno zpět — nic nebylo přidáno. (${detail})`,
    gettingStartedTitle: "Jak začít",
    stepAssumptions: "Nastavte předpoklady",
    stepAddProperty: "Přidejte nemovitost",
    stepDetails: "Doplňte hypotéku, nájem a náklady",
    stepReview: "Projděte projekce",
    stepBackup: "Exportujte zálohu",
  },
  xlsx: {
    exportToExcel: "Exportovat do Excelu",
    exported: (name) => `Exportováno ${name}`,
    exportFailed: (detail) => `Export selhal (${detail})`,
    // Excel sheet names (DR-152, UX-080): ≤ 31 characters, none of []:*?/\.
    sheetNames: {
      projection: "Projekce",
      amortization: "Splátkový kalendář",
      compareKeyFigures: "Klíčové údaje",
      compareNetWorth: "Čisté jmění",
      compareNetCashFlow: "Čistý cash flow",
      compareLtv: "LTV",
    },
    metric: "Ukazatel",
  },

  forms: {
    required: "Povinné",
    invalidHint: {
      date: "Zadejte datum od 01.01.1900 ve tvaru dd.mm.yyyy",
      money:
        "Zadejte částku 0 nebo vyšší, např. 1 250 000 (tisíce oddělte mezerou)",
      pct: "Zadejte procenta, např. 4,5",
      int: "Zadejte celé číslo, např. 25",
      prepayments:
        "Zkontrolujte označené řádky: datum jako dd.mm.yyyy, částka nad 0 a poplatek 0 nebo více",
      recasts:
        "Zkontrolujte označené řádky: datum jako dd.mm.yyyy a nové datum splatnosti nebo splátka nad 0",
      draws: "Jedna tranše na řádek: dd.mm.yyyy = částka",
    },
    /** A bounded whole-number field (UX-068, ADR 0075). */
    positiveAmount: "Zadejte částku vyšší než 0, např. 500 000",
    intRange: (min: string, max: string) =>
      `Zadejte celé číslo od ${min} do ${max}`,
    drawsPlaceholder: "dd.mm.yyyy = částka  (jedna tranše na řádek)",
    datePlaceholder: "dd.mm.yyyy",
    defaultPlaceholder: "výchozí",
  },

  propertyForm: {
    addTitle: "Přidat nemovitost",
    editTitle: "Upravit nemovitost",
    name: "Název",
    address: "Adresa",
    type: "Typ",
    typeHelp: "např. 2+kk, 3+kk",
    size: "Plocha (m²)",
    garage: "Garáž",
    garageYes: "Ano",
    purchaseDate: "Datum koupě",
    purchasePrice: "Kupní cena",
    appreciationOverride: "Vlastní zhodnocení",
    rentIndexOverride: "Vlastní indexace nájmu",
    overrideHelp: "Nechte prázdné pro globální hodnotu z Předpokladů",
    errNameExists: "Nemovitost s tímto názvem už existuje",
    acquisitionSection: "Pořízení (nepovinné)",
    acquisitionHelp:
      "Jak byl nákup financován. Prázdná částka je neznámá; 0 je částka. U nemovitosti koupené po začátku projekce jsou vlastní zdroje platbou při koupi.",
    ownCash: "Vlastní zdroje",
    ownCashHelp:
      "Všechny vlastní peníze vložené při koupi, včetně nákladů a úprav",
    transactionCosts: "Transakční náklady",
    transactionCostsHelp:
      "Makléř, právní služby, katastr, odhad a podobné poplatky",
    initialWorks: "Počáteční úpravy",
    initialWorksHelp:
      "Rekonstrukce nebo vybavení placené při koupi či hned po ní",
    fundingNote: "Poznámka k financování",
    unknownPlaceholder: "neznámé",
  },

  projGrid: {
    /** One-letter "year" prefix for "Y5 · 2031" labels (UX-032). */
    yearPrefix: "R",
    year: "Rok",
    opening: "počátek",
    period: "Období",
    value: "Hodnota",
    debt: "Dluh",
    equity: "Kapitál",
    ltv: "LTV",
    grossRent: "Hrubý nájem",
    effective: "Efektivní",
    holding: "Náklady",
    noi: "NOI",
    interest: "Úrok",
    principal: "Jistina",
    debtSvc: "Dluh. služba",
    draws: "Čerpání",
    refinanced: "Rozdíl při refinancování",
    prepaid: "Mimořádně splaceno",
    prepaymentFees: "Poplatky za mimořádné splátky",
    netCf: "Čistý CF",
    dscr: "DSCR",
    caption: "Projekce rok po roku",
  },

  about: {
    title: "O aplikaci",
    subtitle: APP_NAME,
    version: (v: string) => `Verze ${v}`,
    tagline: "Lokální nástroj pro sledování vašeho portfolia nájemních bytů.",

    appTitle: "Co aplikace umí",
    appBody:
      "Sledujte své nájemní byty na jednom místě: aktuální hodnotu, dluh a vlastní kapitál, nájem, provozní náklady a cash flow. Aplikace promítá nominální i reálné výsledky do zvoleného horizontu (výchozí je 30 let), ukazuje ukazatele jako LTV, DSCR, výnosy a IRR a umožňuje zátěžové testy portfolia pomocí scénářů co-kdyby.",
    formatsNote:
      "Jazyk mění jen texty rozhraní. Částky jsou vždy v českých korunách (Kč) s českým formátem čísel a dat.",

    privacyTitle: "Soukromí na prvním místě",
    privacyBody:
      "Vše běží offline na vašem Macu. Portfolio je uloženo v lokální databázi SQLite — žádné účty, žádný cloud, žádná analytika. Vaše data nikdy neopustí zařízení.",

    developerTitle: "Vývojář",
    developerName: "Vlastimil Bureš",
    feedbackLabel: "Zpětná vazba",
    feedbackText: "github.com/vlastimilbures/real-estate-tracker/issues",
    sourceLabel: "Zdrojový kód",
    sourceText: "github.com/vlastimilbures/real-estate-tracker",
    limitsLabel: "Omezení modelu",
    limitsText:
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/model-limitations.md",
    dataSafetyLabel: "Bezpečnost dat",
    dataSafetyText:
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/data-safety.md",

    builtWithTitle: "Postaveno na",
    builtWithBody: "Tauri 2 · React · TypeScript · SQLite · decimal.js",
    precisionNote:
      "Peníze se počítají přesnou desetinnou aritmetikou (nikdy ne v plovoucí řádové čárce). Výsledky jsou testovány proti referenčním hodnotám s tolerancí ±1 Kč.",

    copyright: "© 2026 Vlastimil Bureš",
    usageNote: "Vytvořeno pro osobní použití.",
  },

  guide: {
    title: "Průvodce",
    subtitle: "Jak se čísla počítají a co znamenají",
    eg: "např.",
    howItWorksTitle: "Jak to funguje",
    howItWorksHint: "Od vašich dat k číslům na obrazovce",
    cardFlowTitle: "Jednosměrný tok dat",
    cardFlowBody:
      "Vaše záznamy projdou čistým výpočetním enginem a obrazovky zobrazí výsledek. Žádné číslo se nezadává ručně — každé je odvozené.",
    cardAsOfTitle: "Vše je „k“ určitému datu",
    cardAsOfBody:
      "Snímek je vaše portfolio ve zvolený den; projekce ho posouvá rok po roce. Snímek k základnímu datu se rovná roku 0 projekce.",
    cardEffectiveTitle: "Záznamy mají platnost k datu",
    cardEffectiveBody:
      "Ocenění, nájmy a hypotéky mají vždy časové rozmezí. Pro kterýkoli den engine vybere ten platný — takže končící nájem předá štafetu dalšímu.",
    cardDataCheckTitle: "Kontrola dat ukáže náhradní hodnoty",
    cardDataCheckBody:
      "Když je ocenění staré nebo chybí, neplatí žádný nájem, fixace skončila bez nových podmínek, nemovitost používá výchozí hodnoty portfolia nebo nemá zadané vlastní zdroje vložené při koupi, Kontrola dat na Přehledu a u každé nemovitosti to uvede, včetně toho, co to mění a kde to opravit.",
    snapshotTitle: "Ukazatele snímku",
    snapshotHint: "Aktuální obrázek nemovitosti nebo portfolia",
    snapshotProse:
      "Součty portfolia sčítají jen nemovitosti, které aktuálně vlastníte a jsou aktivní; poměry jako LTV a DSCR portfolia vycházejí z těchto součtů. Deaktivace nemovitost jen vynechá: nezaznamená prodej, výnos z prodeje ani splacení úvěru.",
    mortgagesTitle: "Hypotéky a fixace",
    mortgagesHint: "Jak se zůstatek úvěru mění v čase",
    mortgagesProse1Pre: "Úvěry jsou ",
    mortgagesProse1Annuities: "anuity",
    mortgagesProse1Mid:
      " — konstantní měsíční splátka, nejprve rozdělená na úrok: ",
    fInterest: "úrok = zůstatek × sazba ÷ 12",
    fPrincipal: "jistina = splátka − úrok",
    fNewBalance: "nový zůstatek = zůstatek − jistina",
    mortgagesProse1Post:
      ". Zpočátku je platba převážně úrok; jak zůstatek klesá, více jde na jistinu, zatímco splátka zůstává stejná.",
    mortgagesProse2Pre: "České hypotéky mají ",
    mortgagesProse2Fixation: "fixační období",
    mortgagesProse2Mid:
      " — roky, kdy je sazba zafixovaná. Když skončí, sazba se ",
    mortgagesProse2Resets: "resetuje",
    mortgagesProse2Mid2: " na vaši sazbu po fixaci a splátka se ",
    mortgagesProse2Reamortizes: "znovu umoří",
    mortgagesProse2Post:
      ", aby splatila zbývající zůstatek za zbývající dobu, takže se platba k tomu datu může zvýšit nebo snížit. Výhled úvěru na stránce nemovitosti ukazuje u každého úvěrového bloku modelovaný konec fixace a dluh, který přejde na novou sazbu, a také zbývající dobu splácení.",
    mortgagesProse3:
      "Mimořádné splátky a změny splatnosti zadáte u každého úvěrového bloku v jeho formuláři. Mimořádná splátka k datu splatí jistinu navíc a buď sníží splátku, nebo zkrátí splatnost; poplatek se platí z vlastních prostředků a dluh nesnižuje. Změna splatnosti převede úvěr na nové datum splatnosti nebo novou splátku. Mimořádné splátky jsou vaše vlastní prostředky, mimo čistý cash flow a DSCR. Stránka nemovitosti ukazuje modelované doplacení a úrok, který mimořádné splátky ušetří za zbývající dobu úvěru, a upozorní, když je splátka vyšší než zůstatek nebo připadá po doplacení.",
    projectionTitle: "Projekce do horizontu",
    projectionHint: "Posunutí snímku do budoucna",
    projectionProse1:
      "Každý vstup roste vpřed, rok po roce, až k horizontu (výchozí je 30 let, nastavíte v Nastavení → Předpoklady):",
    projectionProse2:
      "Nemovitost nebo nájem začínající uprostřed roku se za první rok poměrně rozpočítá. Zabudovaná kontrola: když jsou všechny úvěry splaceny v rámci horizontu, součet splacené jistiny se rovná počátečnímu dluhu plus pozdějším čerpáním — nikdy víc, nikdy míň. Výstupy zahrnují první rok s kladným cash flow a rok bez dluhu.",
    nominalRealTitle: "Nominální vs reálné",
    nominalRealHint: "Přepínač na Přehledu a Projekcích",
    nominalRealProsePre:
      "Nominální hodnoty jsou budoucí koruny v nominální výši. Reálné hodnoty odstraní inflaci a ukážou kupní sílu k základnímu datu (začátku projekce): ",
    fCpi: "CPI = Π (1 + inflace)",
    fReal: "reálné = nominální ÷ CPI",
    nominalRealProsePost:
      ". Při 2,5% inflaci má 1,0 M za 30 let hodnotu ≈ 477 k v penězích k základnímu datu.",
    nominalRealTodayNote:
      "Reálné hodnoty se přepočítávají k začátku projekce, proto je snímek Dnes s pozdějším datem o něco nižší než nominální hodnota. Je to záměr.",
    returnsTitle: "Výnosy za celý horizont",
    returnsHint: "Růst a cash flow jako jediné číslo",
    scenariosTitle: "Scénáře",
    scenariosHint: "Testování co-kdyby bez zásahu do vašich dat",
    scenariosProse:
      "Scénář přepisuje pouze předpoklady — nikdy vaše skutečné nemovitosti či hypotéky — takže můžete volně porovnávat a vracet se zpět. Vedle trvalých nastavení (zhodnocení, indexace, neobsazenost, sazba po fixaci, inflace) můžete aplikovat dočasné šoky:",
    developmentTitle: "Developerské nemovitosti",
    developmentHint: "Výstavba financovaná v tranších",
    developmentProsePre:
      "Nemovitost ve výstavbě může být financována developerským úvěrem čerpaným v ",
    developmentTranches: "tranších",
    developmentProseMid: ". Během výstavby je úvěr ",
    developmentInterestOnly: "pouze úrokový",
    developmentProsePost:
      " (bez jistiny) a hodnota roste s podílem dosud načerpaného úvěru. Když přijde tranše nebo se výstavba dokončí, úvěr se znovu umoří na běžný splátkový plán.",
    limitsTitle: "Omezení a bezpečnost dat",
    limitsProse:
      "Tato čísla jsou plánovací odhady, ne nabídka banky ani zaručený výsledek. Dva dokumenty ve zdrojovém repozitáři vysvětlují, co model zjednodušuje nebo vynechává, a jak data zálohovat a obnovit po neúspěšné aktualizaci.",
    glossaryTitle: "Slovníček",
    snapshotDefs: {
      value: {
        name: "Hodnota",
        formula: "ocenění × (1 + zhodnocení) ^ roky",
        meaning:
          "Tržní hodnota narostlá z posledního zaznamenaného ocenění. Nové ocenění křivku znovu ukotví.",
        eg: "5,0 M při 4 %/rok → 5,0 M × 1,04² ≈ 5,41 M po 2 letech.",
      },
      debt: {
        name: "Dluh",
        formula: "zůstatek k datu",
        meaning:
          "Zbývající zůstatek úvěru z umořovacího plánu — odráží každou splátku i případný reset sazby.",
      },
      equity: {
        name: "Kapitál",
        formula: "hodnota − dluh",
        meaning:
          "Kolik je nemovitost vaše, jakmile je banka splacena — váš čistý podíl.",
        eg: "5,41 M − 2,6 M = 2,81 M.",
      },
      ltv: {
        name: "LTV",
        formula: "dluh ÷ hodnota",
        meaning:
          "Podíl nemovitosti financovaný bankou. Nižší = bezpečnější polštář proti propadu ceny.",
        eg: "2,6 M ÷ 5,4 M ≈ 48 % financováno.",
      },
      grossRent: {
        name: "Hrubý roční nájem",
        formula: "měsíční nájem × 12",
        meaning: "Hrubý roční nájem před prázdnými měsíci a náklady.",
        eg: "20 k/měs × 12 = 240 k.",
      },
      effectiveIncome: {
        name: "Efektivní hrubý příjem",
        formula: "hrubý nájem × (1 − neobsazenost)",
        meaning:
          "Nájem, který reálně vyberete, s ohledem na občas prázdný byt.",
        eg: "240 k × (1 − 5 %) = 228 k.",
      },
      holdingCosts: {
        name: "Náklady na držbu",
        formula: "fixní + (správa % + údržba %) × hrubý nájem",
        meaning:
          "Roční provozní náklad: fixní položky (daň, pojištění, SVJ, ostatní) plus správa a údržba jako % z nájmu.",
        eg: "36 k + (15 %+5 %)×240 k = 84 k.",
      },
      noi: {
        name: "NOI",
        formula: "efektivní příjem − náklady na držbu",
        meaning:
          "Provozní zisk před hypotékou — hotovost, kterou sám aktivum vynáší.",
        eg: "228 k − 84 k = 144 k.",
      },
      debtService: {
        name: "Roční dluhová služba",
        formula: "měsíční splátka × 12",
        meaning: "Celkové splátky hypotéky za rok (úrok plus jistina).",
        eg: "10 k/měs → 120 k.",
      },
      netCashFlow: {
        name: "Čistý cash flow",
        formula: "NOI − dluhová služba",
        meaning:
          "Modelovaný roční cash flow po nákladech a hypotéce — odhad, ne záznam z bankovního účtu. Může být záporný.",
        caveat: "Nejde o skutečné příjmy.",
        eg: "144 k − 120 k = +24 k.",
      },
      dscr: {
        name: "DSCR",
        formula: "NOI ÷ dluhová služba",
        meaning:
          "Zda nájem pokryje hypotéku. Nad 1,0 si nemovitost splácí úvěr sama; pod tím doplácíte.",
        eg: "144 k ÷ 120 k = 1,20× (20 % rezerva).",
      },
      grossYield: {
        name: "Hrubý výnos",
        formula: "hrubý nájem ÷ hodnota",
        meaning:
          "Nájem jako % hodnoty, bez nákladů a dluhu — rychlé srovnávací číslo.",
        eg: "240 k ÷ 5,4 M ≈ 4,4 %.",
      },
      netYield: {
        name: "Čistý výnos (cap rate)",
        formula: "NOI ÷ hodnota",
        meaning:
          "Výnos z hodnoty po provozních nákladech, bez hypotéky — standardní srovnání.",
        eg: "144 k ÷ 5,4 M ≈ 2,7 %.",
      },
      weightedAvgRate: {
        name: "Vážená průměrná sazba",
        formula: "Σ(dluh × sazba) ÷ celkový dluh",
        meaning:
          "Smíšené náklady na úvěr napříč všemi hypotékami, vážené tak, aby větší úvěry počítaly víc.",
        eg: "1 M@2 % + 3 M@4 % → 3,5 %.",
      },
    },
    projectionDefs: {
      value: {
        name: "Hodnota",
        formula: "roste o zhodnocení",
        meaning: "Roste každý rok o míru zhodnocení.",
      },
      rent: {
        name: "Nájem",
        formula: "podle nájemních smluv, indexovaný",
        meaning:
          "Řídí se vašimi nájmy měsíc po měsíci. Mezera mezi nájmy nevynáší nic, poslední nájem se považuje za prodloužený a každý nájem se indexuje od svého začátku.",
      },
      vacancy: {
        name: "Neobsazenost",
        formula: "uplatněna každý rok",
        meaning:
          "Rezerva na neobsazenost se z nájmu bere každý rok, stejně jako ve snímku.",
      },
      costs: {
        name: "Náklady",
        formula: "rostou s CPI",
        meaning:
          "Náklady na držbu inflují přes index CPI sestavený z míry inflace.",
      },
      debt: {
        name: "Dluh",
        formula: "umořovací plán",
        meaning: "Sleduje plán včetně resetů po fixaci.",
      },
      nextReset: {
        name: "Příští změna sazby",
        formula: "začátek + roky fixace",
        meaning:
          "Nejbližší modelový konec fixace a zůstatek podle plánu po splátce splatné v ten den. Tento zůstatek přechází na sazbu po fixaci.",
        caveat: "Vychází ze zadaných úvěrů, nejde o termín od banky.",
      },
      debtResetting: {
        name: "Dluh se změnou sazby do N let",
        formula: "Σ zůstatků při koncích fixace v období",
        meaning:
          "Kolik dluhu dosáhne konce fixace během příštího 1, 3 nebo 5 let; každý konec fixace se počítá jednou.",
      },
      totalInterest: {
        name: "Úroky celkem",
        formula: "Σ úroků, roky 1…N",
        meaning:
          "Všechny úroky zaplacené z úvěrů do horizontu, včetně úroků z úvěru, který běží před datem koupě nemovitosti. Reálný pohled každý rok deflatuje indexem inflace daného roku.",
      },
    },
    returnsDefs: {
      multiple: {
        name: "Násobek čistého jmění",
        formula: "kapitál na horizontu ÷ kapitál na začátku projekce",
        meaning:
          "Kolikrát se očekává, že váš kapitál na začátku projekce do horizontu vzroste.",
        eg: "22 M → 110 M = 5,0×.",
      },
      cagr: {
        name: "CAGR",
        formula: "(konec ÷ začátek) ^ (1 ÷ roky) − 1",
        meaning:
          "Vyhlazená, ustálená roční míra růstu od počáteční po konečnou hodnotu.",
        eg: "5× za 30 let ≈ 5,5 %/rok.",
      },
      irr: {
        name: "Pákové IRR",
        formula: "sazba, kde NPV = 0",
        meaning:
          "Roční návratnost od začátku projekce: kapitál k tomuto dni se bere jako vložená částka, k tomu roční cash flow a projektovaný kapitál na horizontu (bez nákladů na prodej a daní), s hypotékou v rovnici.",
        caveat: "Nejde o návratnost vašich původních peněz vložených do koupě.",
        eg: "zpočátku záporné, velký kapitál na horizontu → ≈ 6 %/rok.",
      },
      cashInvested: {
        name: "Vložené vlastní zdroje",
        formula: "Σ zadaných vlastních zdrojů",
        meaning:
          "Vlastní peníze zadané jako vložené při každé koupi, včetně nákladů a úprav, v sekci Pořízení ve formuláři nemovitosti. Přehled ukáže součet, jen když je mají všechny aktivní nemovitosti.",
        caveat:
          "Násobek, CAGR ani IRR z nich nevycházejí; u nemovitosti koupené po začátku projekce jsou platbou při koupi.",
        eg: "1,5 M + 1,7 M + 2,0 M = 5,2 M.",
      },
      sourcesUses: {
        name: "Zdroje a užití",
        formula:
          "užití = cena + náklady + úpravy; zdroje = vlastní zdroje + úvěr na koupi",
        meaning:
          "Kontrola zadaného financování na stránce každé nemovitosti. Rozdíl 1 Kč a víc oběma směry se ukáže jako upozornění, nikdy neblokuje. Úvěr na koupi je první úvěrový blok, pokud začíná nejpozději 90 dní po koupi.",
        eg: "užití 7,30 M, zdroje 7,25 M → chybí 50 tis.",
      },
    },
    scenarioDefs: {
      inflationShock: {
        name: "Inflační šok",
        formula: "+Δ na N let",
        meaning: "Dočasný skok inflace, poté zpět k trendu.",
      },
      rateShock: {
        name: "Šok sazby",
        formula: "+Δ kolem refixu",
        meaning: "Vyšší sazba kolem resetu fixace po stanovenou dobu.",
      },
      valueCrash: {
        name: "Propad hodnoty",
        formula: "jednorázový pokles v roce Y",
        meaning:
          "Jednorázový pokles hodnoty; růst pokračuje z nižší základny. Propad na začátku projekce sníží počáteční kapitál, takže procentní výnosy mohou růst, i když vaše jmění klesá.",
      },
    },
    glossary: {
      noi: {
        term: "NOI",
        def: "Čistý provozní příjem: efektivní nájem − náklady na držbu.",
      },
      dscr: {
        term: "DSCR",
        def: "NOI ÷ dluhová služba. Nad 1 = nájem pokryje hypotéku.",
      },
      ltv: { term: "LTV", def: "Loan-to-value: dluh ÷ hodnota." },
      capRate: { term: "Cap rate / čistý výnos", def: "NOI ÷ hodnota." },
      grossYield: { term: "Hrubý výnos", def: "Hrubý nájem ÷ hodnota." },
      equity: { term: "Kapitál", def: "Hodnota − dluh; váš čistý podíl." },
      egi: {
        term: "Efektivní hrubý příjem",
        def: "Hrubý nájem po rezervě na neobsazenost.",
      },
      annuity: {
        term: "Anuita",
        def: "Konstantní splátka; zpočátku převážně úrok, později převážně jistina.",
      },
      fixation: {
        term: "Fixace",
        def: "Roky, po které je sazba české hypotéky zafixovaná.",
      },
      reset: {
        term: "Reset / znovu umořit",
        def: "Na konci fixace se sazba změní a splátka se přepočítá.",
      },
      svj: {
        term: "SVJ / fond oprav",
        def: "Fond na opravy domu (měsíční náklad).",
      },
      propertyTax: {
        term: "Daň z nemovitých věcí",
        def: "Roční daň z nemovitosti.",
      },
      cagr: { term: "CAGR", def: "Složená roční (vyhlazená) míra růstu." },
      irr: {
        term: "IRR",
        def: "Jediná roční návratnost vyrovnávající vektor cash flow.",
      },
      nominal: { term: "Nominální", def: "Budoucí koruny v nominální výši." },
      real: {
        term: "Reálné",
        def: "Kupní síla k základnímu datu (bez inflace).",
      },
    },
  },
};
