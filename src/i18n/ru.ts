// Russian dictionary. Authored to best effort; domain/finance terminology (DSCR, LTV,
// "cap rate", "фонд ремонта", IRR) should be reviewed by a native speaker — flagged for
// the user. Annotated `: Dictionary` so missing keys relative to en.ts are tsc errors.
import type { Dictionary } from "./en";
import { ruPlural } from "./plural";
import { APP_NAME } from "./appName";

export const ru: Dictionary = {
  common: {
    /** A KPI with no value, e.g. a levered IRR (UX-079). */
    notApplicable: "н/д",
    irrNotUnique:
      "IRR не единственна: денежные потоки окупаются при нескольких ставках",
    irrNoRoot: "Нет IRR в диапазоне от −90 % до +1000 %",
    /** Unit shown inside year-count fields (UX-034). */
    yearsSuffix: "лет",
    asOfGroup: "На дату",
    plusYears: (n) => `+${n} г.`,
    searchProperties: "Поиск объектов",
    searchPlaceholder: "Поиск…",
    /** Short word for thousands on chart axes (UX-034). */
    thousandsShort: "тыс.",
    cancel: "Отмена",
    save: "Сохранить",
    create: "Создать",
    saveChanges: "Сохранить изменения",
    unsavedTitle: "Отменить несохранённые изменения?",
    unsavedBody: "Изменения на этой странице не сохранены.",
    discardChanges: "Отменить изменения",
    unsavedChanges: "Есть несохранённые изменения",
    allChangesSaved: "Все изменения сохранены",
    saveFailedKept: "Сохранить не удалось — введённые данные сохранены в форме",
    fieldsNeedAttention: (n) =>
      `${n} ${ruPlural(n, ["поле требует", "поля требуют", "полей требуют"])} внимания:`,
    keepEditing: "Продолжить редактирование",
    edit: "Изменить",
    delete: "Удалить",
    yesDelete: "Да, удалить",
    confirmDeleteRow: "Удалить эту запись?",
    deleting: "Удаление…",
    staleData:
      "Изменение может быть ещё не видно: не удалось перезагрузить данные. Перезагрузите, чтобы увидеть сохранённое.",
    reload: "Перезагрузить",
    saving: "Сохранение…",
    close: "Закрыть",
    dismiss: "Закрыть",
    noneYet: "Пока ничего.",
    today: "Сегодня",
    all: "Все",
    addVerb: "Добавить",
    asOfLabel: "На дату",
    asOfHintProjection: (year, period) =>
      `Для будущих дат показан ближайший год прогноза (${year}, ${period})`,
    asOfHintBeyond: (d) =>
      `За горизонтом — показаны записи, действующие на ${d}, а не прогноз`,
    asOfHintSnapshot: (d) => `Показаны записи, действующие на ${d}`,
    noPortfolioTitle: "Портфеля пока нет",
    noPortfolioBody:
      "Добавьте объект или импортируйте файлы CSV, чтобы начать.",
    importCsv: "Импорт CSV",
    nominal: "Номинал",
    real: "Реальные",
    nominalLower: "номинально",
    realLower: "реально",
  },

  app: {
    loadingEyebrow: APP_NAME,
    loading: "Загрузка портфеля…",
    dbErrorEyebrow: "Не удалось открыть базу данных",
    bootRetryHint:
      "На диске ничего не изменено. Попробуйте ещё раз; если ошибка повторяется, закройте и снова откройте приложение и сохраните файл журнала для диагностики.",
    tryAgain: "Попробовать снова",
  },

  inputRules: {
    INVALID_DATE: "Неверная дата",
    NON_FINITE_NUMBER: "Не конечное число",
    NEGATIVE_AMOUNT: "Не может быть отрицательным",
    NEGATIVE_PRINCIPAL: "Основной долг не может быть отрицательным",
    RATE_OUT_OF_RANGE: "Должно быть долей от нуля до единицы",
    INSTALMENT_BELOW_INTEREST:
      "Ежемесячный платёж не покрывает ежемесячные проценты, кредит никогда не будет погашен",
    ZERO_RATE_ZERO_INSTALMENT:
      "При нулевой ставке платёж должен быть больше нуля",
    MISSING_TERM_FOR_DEV_LOAN:
      "Кредиту с траншами или периодом выплаты только процентов нужен срок",
    NON_POSITIVE_DRAW: "Каждый транш должен быть больше нуля",
    DRAW_BEFORE_START:
      "Транш должен быть датирован позже начала кредита; сумма, выданная в день начала, относится к начальному долгу",
    DRAW_AFTER_SCHEDULE_END:
      "Транш должен быть датирован раньше последнего платежа по кредиту (начало плюс срок кредита)",
    COMPLETION_BEFORE_START:
      "Конец периода выплаты только процентов раньше начала кредита",
    DUPLICATE_BLOCK_START:
      "У этого объекта уже есть ипотека, начинающаяся в тот же день",
    END_BEFORE_START: "Дата окончания раньше даты начала",
    DUPLICATE_HOLDING_COST:
      "У объекта больше одной записи расходов на содержание",
    ORPHAN_ROW: "Запись относится к несуществующему объекту",
    HORIZON_NOT_POSITIVE: "Горизонт прогноза должен быть не меньше одного года",
    INVALID_TERM: "Срок в годах неверен",
    SHOCK_OUT_OF_RANGE: "Шок сценария вне допустимого диапазона",
    ASOF_BEFORE_BASEDATE: "Дата раньше базовой даты",
  },

  writeErrors: {
    duplicatePropertyName: "Объект с таким названием уже существует",
    duplicateValuationDate: "У этого объекта уже есть оценка с этой даты",
    duplicateLeaseStart:
      "У этого объекта уже есть аренда, начинающаяся с этой даты",
    duplicateId:
      "Запись с таким же внутренним идентификатором уже существует, ничего не изменено",
    invalidFlag: "Значение да/нет недопустимо",
    invalidJson: "Сохранённое значение не удаётся прочитать",
    missingValue: "Не указано обязательное значение",
    otherConstraint: "База данных отклонила изменение, ничего не изменено",
  },

  dataErrors: {
    DB_INTEGRITY:
      "Файл базы данных не прошёл проверку целостности. Ничего не изменено. Закройте приложение и восстановите последнюю копию базы данных.",
    DB_NEWER:
      "Эта база данных сохранена более новой версией приложения. Ничего не изменено. Откройте её в той версии.",
    MIGRATION_CONFLICT:
      "Обновление базы данных остановлено до каких-либо изменений: некоторые сохранённые записи противоречат новым правилам. Исправьте их в предыдущей версии приложения, затем снова откройте эту версию.",
    MIGRATION_BACKUP_FAILED:
      "Обновление базы данных не началось: страховочную копию не удалось записать или проверить. Ничего не изменено. Проверьте свободное место на диске и снова откройте приложение.",
    MIGRATION_FAILED:
      "Обновление базы данных не удалось и было отменено. Ничего не изменено; предыдущая версия приложения по-прежнему открывает эту базу.",
    ROW_INVALID:
      "Сохранённая запись содержит значение, которое приложение не может прочитать. Ничего не изменено.",
    ROW_MISSING: "Запись больше не существует. Ничего не изменено.",
    SCENARIO_INVALID:
      "Сохранённый сценарий не удаётся прочитать. Ничего не изменено.",
    detailsHeading: "Затронутые записи",
    logHint:
      "Подробности в журнале приложения: ~/Library/Logs/com.bures.realestate-tracker/app.log",
  },

  errorBoundary: {
    title: "На этом экране произошла ошибка",
    tryAgain: "Повторить",
    invalidDataTitle:
      "Часть сохранённых данных нарушает правило, нужное для расчётов",
    invalidDataBody:
      "Исправьте запись ниже; цифры на этом экране вернутся, когда она станет корректной.",
    openProperty: "Открыть объект",
    assumptionsRecord: "Допущения",
    unknownRecord: "Запись",
  },

  monthsShort: [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ],

  calendar: {
    open: "Открыть календарь",
    weekStartsOn: 1,
    weekdaysShort: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
  },

  nav: {
    dashboard: "Обзор",
    properties: "Объекты",
    projections: "Прогнозы",
    scenarios: "Сценарии",
    guide: "Справка",
    importData: "Импорт",
    settings: "Настройки",
  },

  menu: {
    about: `О программе ${APP_NAME}`,
    settings: "Настройки…",
    newProperty: "Новый объект…",
  },

  charts: {
    table: "Таблица",
  },

  shell: {
    offline: "Офлайн · локально",
    backupHintNone: "Резервной копии пока нет. Экспортировать",
    backupHintOld: (days: number) =>
      `Последняя копия ${days} ${ruPlural(days, ["день", "дня", "дней"])} назад. Экспортировать`,
    dismissBackupHint: "Скрыть напоминание о копии",
    baseDate: (d) => `Начало прогноза ${d}`,
    expandSidebar: "Развернуть панель",
    collapseSidebar: "Свернуть панель",
    appearance: "Оформление",
    nominalOrReal: "Номинальные или реальные значения",
    language: "Язык",
    themeLight: "Светлая",
    themeDark: "Тёмная",
    themeSystem: "Системная",
    themeTitle: (cur, next) => `Тема: ${cur} — нажмите для ${next}`,
    themeAria: (cur, next) => `Тема: ${cur}. Переключить на ${next}`,
  },

  dashboard: {
    title: "Обзор",
    subtitleDefault: "Обзор портфеля",
    subFilter: (n, total) => `${n} из ${total} объектов`,
    asOf: (d) => `на ${d}`,
    netWorth: "Чистые активы",
    netWorthInYear: (endYear, n) =>
      `Чистые активы в ${endYear} г. (горизонт ${n} ${ruPlural(n, ["год", "года", "лет"])})`,
    assetsDebtEquity: (assets, debt) =>
      `Активы ${assets} · Долг ${debt} · Капитал в Kč`,
    realTodayKc: " · реально (Kč на базовую дату)",
    multipleFromStartMode: (mult, mode) =>
      `${mult} от начала прогноза · ${mode}`,
    leveredIrr: "IRR с плечом",
    irrFoot: (n, mode) =>
      `${n} ${ruPlural(n, ["год", "года", "лет"])} · после долга · ${mode}`,
    portfolioLtv: "LTV портфеля",
    badgeConservative: "Консервативно",
    badgeModerate: "Средне",
    badgeHigh: "Высоко",
    debtOverValue: "Долг ÷ стоимость",
    portfolioDscr: "DSCR портфеля",
    badgeCoversDebt: "Покрывает долг",
    badgeShortfall: "Дефицит",
    noiOverDebtService: "NOI ÷ обслуживание долга",
    netYieldCap: "Чистая доходность (cap rate)",
    grossYieldFoot: (v) => `Валовая доходность ${v}`,
    annualNetCashFlow: "Годовой чистый денежный поток",
    noiMinusDebtService: "NOI − обслуживание долга, сейчас",
    noiMinusDebtServiceYear: (year) =>
      `NOI − обслуживание долга, год прогноза ${year}`,
    noiMinusDebtServiceOn: (d) => `NOI − обслуживание долга, на ${d}`,
    currentMonthlyCashFlow: "Текущий месячный денежный поток",
    monthlyCashFlowOn: (d) => `Месячный денежный поток на ${d}`,
    monthlyEquivalentYear: (year, period) =>
      `Месячный эквивалент — год прогноза ${year} (${period})`,
    monthlyHint: (d) =>
      `годовой темп ÷ 12, договоры аренды, действующие на ${d}`,
    monthlyHintProjection: "годовой прогноз ÷ 12",
    inflowLabel: "Приток · эффективная аренда",
    outflowLabel: "Отток · расходы + обслуживание долга",
    netCashFlowBaseline: "Чистый денежный поток · базовый",
    trajectory: (n) => `${n}-летняя траектория`,
    realTerms: "Реальные значения (Kč на базовую дату)",
    nominalKc: "Номинальные Kč",
    chartValueVsDebtVsEquity: "Стоимость vs долг vs капитал",
    chartEquityChange: "Изменение капитала по годам",
    subEquityChange: "рост стоимости + погашение долга",
    chartNetCashFlowByYear: "Чистый денежный поток по годам",
    chartRentGrossVsEffective: "Аренда — валовая vs эффективная",
    chartNoiVsDebtService: "NOI vs обслуживание долга",
    chartLoanToValue: "Отношение долга к стоимости (LTV)",
    subNetCashFlow: "зелёный плюс, красный минус",
    subLtv: "% — снижается по мере погашения долга",
    seriesValue: "Стоимость",
    seriesDebt: "Долг",
    seriesEquity: "Капитал",
    seriesAppreciation: "Рост стоимости",
    seriesDebtPaydown: "Погашение долга",
    seriesDebtDrawn: "Выборка долга",
    seriesNetEquityChange: "Чистое изменение",
    seriesGross: "Валовая",
    seriesEffective: "Эффективная",
    seriesNoi: "NOI",
    seriesDebtService: "Обслуживание долга",
    seriesNetCashFlow: "Чистый денежный поток",
    seriesLtv: "LTV",
    kpiTitle: "Ключевые показатели",
    kpiHintNominal: "номинальные значения",
    kpiHintReal: "реальные значения (Kč на базовую дату)",
    kpiNetWorthAtHorizon: "Чистые активы на горизонте",
    kpiNetWorthMultiple: "Множитель чистых активов",
    kpiNetWorthCagr: "CAGR чистых активов",
    kpiLeveredIrr: "IRR с плечом",
    kpiCumulativeNetCashFlow: (n) =>
      `Накопленный чистый денежный поток (годы 1–${n})`,
    kpiFirstCfPositiveYear: "Первый год с положительным потоком",
    kpiDebtFullyRepaid: "Долг полностью погашен",
    kpiSumPrincipalRepaid: (n) => `Σ погашенного тела (годы 1–${n})`,
    kpiSumPrincipalRepaidNominal: (n) =>
      `Σ погашенного тела (годы 1–${n}, номинально)`,
    kpiWeightedAvgRate: "Средневзвешенная ставка",
    // Панель «Финансирование и ближайшие события» (ADR 0103).
    financingTitle: "Финансирование и ближайшие события",
    financingHint: (d) => `расчётные даты на ${d}`,
    financingNextReset: "Следующая смена ставки",
    financingNextResetNone: "Не предвидится",
    financingBalanceAtReset: "Долг на момент смены",
    financingBalanceAtResetNominal: "Долг на момент смены (номинально)",
    financingResettingWithin: (n) =>
      `Долг со сменой ставки в течение ${n} ${ruPlural(n, ["года", "лет", "лет"])}`,
    financingResettingWithinNominal: (n) =>
      `Долг со сменой ставки в течение ${n} ${ruPlural(n, ["года", "лет", "лет"])} (номинально)`,
    financingLoans: (n) =>
      `${n} ${ruPlural(n, ["кредит", "кредита", "кредитов"])}`,
    financingWindow: "Период смены ставки",
    financingWindowOption: (n) => `${n} г.`,
    financingTotalInterest: (n) => `Проценты всего (годы 1–${n})`,
    financingTotalInterestReal: (n) => `Проценты всего (годы 1–${n}, реально)`,
    financingUpcoming: "Ближайшие 12 месяцев",
    financingNoEvents: "По модели в ближайшие 12 месяцев ничего не ожидается.",
    financingMoreEvents: (n) => `+ ещё ${n}`,
    financingNoLoans: "В этой выборке нет ипотеки.",
    financingEventFixationEnd: "Конец фиксации",
    financingEventLoanPayoff: "Кредит погашен",
    financingEventDevCompletion: "Конец периода только процентов (сдача)",
    financingEventLeaseEnd: "Аренда заканчивается, новая не внесена",
    financingDisclaimer:
      "Даты рассчитаны по внесённым кредитам и договорам аренды. Это не сроки банка; точные даты уточните в банке.",
  },

  properties: {
    title: "Объекты",
    subtitle: (n) => `${n} ${ruPlural(n, ["квартира", "квартиры", "квартир"])}`,
    addProperty: "Добавить объект",
    emptyTitle: "Нет объектов",
    emptyBody: "Добавьте первый объект или импортируйте данные из файлов CSV.",
    colProperty: "Объект",
    colValue: "Стоимость",
    colDebt: "Долг",
    colEquity: "Капитал",
    colLtv: "LTV",
    colNoi: "NOI",
    colNetCashFlow: "Чистый денежный поток",
    colDscr: "DSCR",
    badgePending: "Ожидает",
    badgeInactive: "Неактивен",
    editProperty: "Изменить объект",
    deleteProperty: "Удалить объект",
    confirmDelete: (name) =>
      `Удалить ${name} и все связанные ипотеки, оценки, аренды и расходы на содержание? Это нельзя отменить.`,
  },

  propertyDetail: {
    fallbackTitle: "Объект",
    noneSelectedTitle: "Объект не выбран",
    backToProperties: "Назад к объектам",
    allProperties: "‹ Все объекты",
    purchased: (d) => `куплено ${d}`,
    pendingPurchase: (d) => `ожидает — покупка ${d}`,
    asOf: (d) => `на ${d}`,
    deactivated: "деактивировано",
    deactivate: "Деактивировать",
    deactivating: "Деактивация…",
    yesDeactivate: "Да, деактивировать",
    activate: "Активировать",
    activating: "Активация…",
    deactivateTitle: "Исключить этот объект из обзоров и прогнозов",
    activateTitle: "Снова включить этот объект в обзоры и прогнозы",
    confirmDeactivate: (name) =>
      `Деактивировать ${name}? Объект будет исключён из обзоров и прогнозов до повторной активации. Данные не удаляются. Деактивация не фиксирует продажу, выручку от продажи или погашение кредита.`,
    inactiveBadge: "Неактивен",
    inactiveNote: "Этот объект исключён из обзоров и прогнозов портфеля.",
    sizeM2: (n) => `${n} m²`,
    marketValue: "Рыночная стоимость",
    debt: "Долг",
    equity: "Капитал",
    dscr: "DSCR",
    ltv: "LTV",
    badgeShort: "Дефицит",
    netCf: "Чистый ДП",
    chartValueVsDebtVsEquity: "Стоимость vs долг vs капитал",
    chartNetCashFlowByYear: "Чистый денежный поток по годам",
    subMKcMode: (mode) => mode,
    seriesValue: "Стоимость",
    seriesDebt: "Долг",
    seriesEquity: "Капитал",
    seriesNetCashFlow: "Чистый денежный поток",
    valuationsTitle: "Оценки",
    valuationsHint:
      "рыночные стоимости с датой действия — для строящегося объекта это завершённая (целевая) стоимость; показанная стоимость растёт с траншами ипотеки",
    addValuation: "оценку",
    colValidFrom: "Действует с",
    colValidTo: "Действует до",
    colMarketValue: "Рыночная стоимость",
    leasesTitle: "Аренды",
    leasesHint:
      "показанную аренду определяет договор, действующий на дату «На дату»",
    addLease: "аренду",
    colStart: "Начало",
    colEnd: "Конец",
    colMonthlyRent: "Месячная аренда",
    mortgagesTitle: "Ипотечные блоки",
    mortgagesHint: "окончание фиксации сбрасывает ставку и переамортизирует",
    addMortgage: "ипотечный блок",
    colInitialPrincipal: "Начальное тело",
    colFixation: "Фиксация",
    colTerm: "Срок",
    colRate: "Ставка",
    colInstalment: "Платёж",
    colDevelopment: "Строительство",
    yrs: (n) => `${n} ${ruPlural(n, ["год", "года", "лет"])}`,
    auto: "авто",
    draws: (n) => `${n} ${ruPlural(n, ["транш", "транша", "траншей"])}`,
    ioUntil: (d) => `% до ${d}`,
    closePrevValuationTitle: "Завершить предыдущую оценку?",
    closePrevValuationBody: (from, end) =>
      `У оценки от ${from} нет даты окончания. Завершить её ${end}, за день до начала новой?`,
    closePrevLeaseTitle: "Завершить предыдущую аренду?",
    closePrevLeaseBody: (from, end) =>
      `У аренды от ${from} нет даты окончания. Завершить её ${end}, за день до начала новой?`,
    closePrevConfirm: "Завершить предыдущую",
    closePrevKeep: "Оставить как есть",
    instalmentHint: (years, amount) =>
      `Аннуитетный платёж на ${years} ≈ ${amount}`,
    instalmentHintDev: (base) =>
      `${base} — для начального тела; пересчитывается при каждом транше и при завершении. Срок кредита обязателен.`,
    devTermNeeded:
      "Строительный кредит — укажите срок кредита в годах; он обязателен при траншах и периоде только процентов.",
    calc: "Рассчитать",
    calcTitle: (years) => `Рассчитать платёж на ${years}`,
    calcDisabled: "Сначала введите тело кредита и процентную ставку",
    fieldValidFrom: "Действует с",
    fieldValidTo: "Действует до",
    fieldMarketValue: "Рыночная стоимость",
    fieldStartDate: "Дата начала",
    fieldEndDate: "Дата окончания",
    fieldMonthlyRent: "Месячная аренда",
    fieldInitialPrincipal: "Начальное тело",
    fieldFixationYears: "Фиксация (годы)",
    fieldLoanTermYears: "Срок кредита (годы)",
    helpLoanTermYears:
      "пусто = вывести из платежа; обязательно для строительных кредитов",
    fieldInterestRate: "Процентная ставка годовых",
    fieldMonthlyInstalment: "Месячный платёж",
    fieldDraws: "Строительные транши (после старта)",
    helpDraws:
      "ДОПОЛНИТЕЛЬНЫЕ транши, выбираемые ПОСЛЕ даты старта — по одному в строке: dd.mm.yyyy = сумма. Первая выборка — это поле «Начальное тело» (не повторяйте её здесь). Общий кредит = начальное тело + эти транши; стоимость объекта растёт с накопленными траншами ÷ общее тело.",
    fieldCompletionDate: "Только проценты до (завершение)",
    helpCompletionDate:
      "до этой даты платить только проценты, затем переамортизировать",
    loanType: "Тип кредита",
    loanTypeStandard: "Стандартный",
    loanTypeDevelopment: "На строительство",
    loanTypeClearWarning: "Стандартный тип удалит транши и дату завершения.",
    loanTypeClearAndSwitch: "Удалить и переключить",
    loanTypeKeepDevelopment: "Оставить строительный",
    successorNote:
      "Новый блок заменяет текущий с даты своего начала (перефиксация или рефинансирование). Приложение моделирует один активный кредит на объект.",
    successorLearnMore: "Подробнее",
    holdingCostsTitle: "Расходы на содержание",
    holdingCostsHint: "оставьте пустым для глобального значения по умолчанию",
    fieldPropertyTax: "Налог на недвижимость /год",
    fieldInsurance: "Страховка /год",
    fieldSvjMo: "SVJ /мес",
    fieldOther: "Прочее /год",
    fieldMgmtPct: "Управление (% аренды)",
    fieldMaintPct: "Обслуживание (% аренды)",
    saveHoldingCosts: "Сохранить расходы на содержание",
    holdingCostsSaved: "Расходы на содержание сохранены",
    projectionTitle: (n) => `${n}-летний прогноз`,
    amortizationWarn: "Месячный платёж не погасит этот кредит к концу срока.",
    loanFrom: (date) => `Кредит от ${date}:`,
    monthsCount: (n) => `${n} ${ruPlural(n, ["месяц", "месяца", "месяцев"])}`,
    maturityPaysOff: (instalment, implied) =>
      `Платёж ${instalment} погашает кредит ${implied},`,
    maturityAfter: (months, contract) =>
      `через ${months} после срока по договору ${contract}.`,
    maturityBefore: (months, contract) =>
      `за ${months} до срока по договору ${contract}.`,
    maturityCheck: "Проверьте платёж или дату погашения.",
    fixationEnded: (end, rate) =>
      `Фиксация закончилась ${end}, а следующий блок не введён, поэтому приложение с этого момента использует ставку после сброса ${rate}. Добавьте условия рефиксации как новый блок ипотеки.`,
    fieldContractMaturity: "Дата погашения по договору",
    helpContractMaturity:
      "из договора; пусто — не проверяется; не используется для строительного кредита",
    amortizationWarnExpected: "Ожидаемый платёж ≈",
    // Section nav (ADR 0107)
    sectionNavLabel: "Разделы объекта",
    sectionOverview: "Обзор",
    sectionRecords: "Записи",
    sectionFinancing: "Финансирование",
    sectionHolding: "Расходы на содержание",
    sectionProjection: "Прогноз",
    sectionAmortization: "Амортизация",
    showAmortization: (n) =>
      `Показать график амортизации (${n} ${ruPlural(n, ["платёж", "платежа", "платежей"])})`,
    hideAmortization: "Скрыть график амортизации",
    amortizationTitle: "График амортизации",
    amortizationMonths: (n) =>
      `${n} ${ruPlural(n, ["месяц", "месяца", "месяцев"])}`,
    amColMonth: "Месяц",
    amColDate: "Дата",
    amColRate: "Ставка",
    amColInstalment: "Платёж",
    amColInterest: "Проценты",
    amColPrincipal: "Тело",
    amColEndBalance: "Конечный остаток",
    realTermsLens: "реальные значения",
    nominalKcLens: "номинальные Kč",
  },

  assumptions: {
    scenariosHint:
      "Это базовые значения для всех экранов. Переопределите их для анализа «что если» в разделе Сценарии.",
    saved: "Допущения сохранены — прогнозы обновлены",
    driversTitle: "Рыночные и прогнозные параметры",
    defaultsTitle: "Значения расходов по умолчанию",
    defaultsHint: "используются, когда у объекта поле оставлено пустым",
    baseDate: "Базовая дата",
    baseDateHelp:
      "Начало прогноза (год 0) и ценовая база реальных значений. Текущие цифры следуют дате «На дату», по умолчанию сегодня.",
    horizon: "Горизонт",
    appreciation: "Рост стоимости годовых",
    rentIndexation: "Индексация аренды годовых",
    inflation: "Инфляция (CPI) годовых",
    vacancy: "Резерв на простой",
    postFixationReset: "Ставка после фиксации",
    propertyTax: "Налог на недвижимость /год",
    insurance: "Страховка /год",
    svj: "SVJ / фонд ремонта /мес",
    other: "Прочее /год",
    mgmt: "Управление (% аренды)",
    maint: "Обслуживание (% аренды)",
  },

  settings: {
    title: "Настройки",
    subtitle: "Допущения и резервная копия данных",
    tabs: {
      assumptions: "Допущения",
      backup: "Резервная копия",
    },
  },

  projections: {
    title: "Прогнозы",
    subtitle: (lens) => `Год за годом · ${lens}`,
    realTerms: "реальные значения",
    nominalKc: "номинальные Kč",
    portfolio: "Портфель",
    entity: "Объект",
  },

  scenarios: {
    plusPp: (n) => `+${n} п. п.`,
    title: "Сценарии",
    subtitle: "Допущения «что если» — База это ваш сохранённый портфель",
    newScenario: "Новый сценарий",
    base: "База",
    savedAssumptions: "сохранённые допущения",
    noOverrides: "без изменений",
    presetsTitle: "Стресс-пресеты",
    presetsHint: (years) =>
      `Один клик сохраняет сценарий. Шоки ставок и инфляции длятся ${years} г., затем спадают; обвал цен постоянный.`,
    showPresets: "Показать пресеты",
    hidePresets: "Скрыть пресеты",
    presetsCollapsedSummary:
      "Шоки ставок, инфляции, обвал цен и комбинированные шоки скрыты.",
    atStart: "Начало",
    atStartTitle: (date) => `В начале прогноза (${date})`,
    rateShockAtRefix: "Шок ставки @ рефикс",
    inflationShock: "Шок инфляции",
    priceCrash: "Обвал цен",
    crashWhen: "Когда",
    rateForYears: (label, years) => `Ставки ${label} на ${years} г.`,
    inflForYears: (label, years) => `Инфляция ${label} на ${years} г.`,
    crashTitle: (label, suffix) => `Обвал цен ${label}${suffix}`,
    crashAt: (label) => ` @ ${label}`,
    combined: "Комбинированные",
    mild: "Умеренный",
    severe: "Жёсткий",
    combinedTitle: (level, parts) => `${level}: ${parts}`,
    addedScenario: (name) => `Добавлено «${name}»`,
    duplicatedScenario: (name) => `Дублировано «${name}»`,
    alreadySaved: (name) => `Уже сохранено: «${name}»`,
    addedCompareFull: (name, max) =>
      `Добавлено «${name}». В сравнении уже ${max} сценария — снимите отметку с одного, чтобы показать его.`,
    duplicatedCompareFull: (name, max) =>
      `Дублировано «${name}». В сравнении уже ${max} сценария — снимите отметку с одного, чтобы показать копию.`,
    confirmDelete: (name: string) =>
      `Удалить сценарий «${name}»? Это действие нельзя отменить.`,
    deletedScenario: (name) => `Удалено «${name}»`,
    listTitle: "Сценарии",
    listHint: (max) =>
      `Отметьте до ${max} сценариев для сравнения. База идёт дополнительно и не считается.`,
    duplicate: "Дублировать",
    emptyList:
      "Пока нет сохранённых сценариев — используйте пресет или «Новый сценарий».",
    compareTitle: "Сравнение",
    nothingSelectedTitle: "Ничего не выбрано",
    nothingSelectedBody: "Отметьте Базу и/или сценарии выше для сравнения.",
    keyFiguresTitle: "Ключевые цифры",
    keyFiguresHint: "номинальные Kč",
    keyFiguresHintReal: "в реальном выражении (цены на дату начала)",
    chartNetWorth: "Чистые активы (капитал)",
    chartNetCashFlow: "Чистый денежный поток по годам",
    chartLtv: "Отношение долга к стоимости (LTV)",
    subPct: "%",
    kpiStartingEquity: "Начальный капитал",
    kpiNetWorthDeltaVsBase: "Δ чистых активов к Базе",
    viewValues: "Значения",
    viewDeltaVsBase: "Δ к Базе",
    viewToggleLabel: "Показать значения или разницу с Базой",
    deltaYears: (n) => (n > 0 ? `+${n} г.` : n < 0 ? `−${-n} г.` : "0 г."),
    deltaNoBaseValue: "У Базы нет значения",
    rebasedReturnsFootnote: (names: string) =>
      `Доходность для ${names} считается от более низкого начального капитала после обвала цен; ваш убыток показывает Δ чистых активов к Базе.`,
    kpiNetWorthNominal: "Чистые активы (номинал)",
    kpiNetWorthReal: "Чистые активы (реальные)",
    kpiNetWorthMultiple: "Множитель чистых активов",
    kpiCagrNominal: "CAGR (номинал)",
    kpiCagrReal: "CAGR (реальный)",
    kpiCumulativeNetCf: "Накопленный чистый ДП",
    kpiLeveredIrrNominal: "IRR с плечом (номинал)",
    kpiLeveredIrrReal: "IRR с плечом (реальный)",
    kpiFirstCfPositiveYear: "Первый год положительного ДП",
    kpiDebtFreeYear: "Год без долга",
    sumAppreciation: (v) => `рост стоимости ${v}`,
    sumRentIndex: (v) => `индексация аренды ${v}`,
    sumVacancy: (v) => `простой ${v}`,
    sumResetRate: (v) => `ставка после фиксации ${v}`,
    sumInflation: (v) => `инфляция ${v}`,
    sumInflationShock: (v, years) => `инфляция +${v} п. п. на ${years} г.`,
    sumRateShock: (v, years) => `ставки +${v} п. п. на ${years} г.`,
    reachHits: (n, m, years) =>
      `затрагивает ${n} из ${m} ${ruPlural(m, ["кредита", "кредитов", "кредитов"])} (конец фиксации ${years})`,
    reachNone:
      "ни у одного кредита фиксация не заканчивается в окне шока, поэтому без эффекта",
    sumValueShock: (v, atYear) =>
      `стоимость −${v}${atYear ? ` @ год${atYear}` : ""}`,
    editTitle: (name) => `Изменить «${name}»`,
    newTitle: "Новый сценарий",
    formHint: "пусто = наследовать Базу",
    name: "Название",
    namePlaceholder: "напр. Рецессия",
    inherit: "наследовать",
    baseValue: (v) => `База ${v}`,
    fieldAppreciation: "Рост стоимости годовых",
    fieldRentIndexation: "Индексация аренды годовых",
    fieldVacancy: "Резерв на простой",
    fieldPostFixationReset: "Ставка после фиксации",
    fieldInflation: "Инфляция годовых",
    fieldInflationShock: "Шок инфляции",
    fieldRateShock: "Шок ставки при рефиксации",
    fieldValueCrash: "Обвал стоимости",
    forYears: "…на годы",
    atYear: "…в году",
    ppSuffix: "п. п.",
    shockHelp:
      "Временно, затем спадает. Добавляет процентные пункты: +2 п. п. превращают 4,5 % в 6,5 %.",
    rateShockHelp:
      "Начинается с конца фиксации каждого кредита, затем спадает. Добавляет процентные пункты: +2 п. п. превращают 4,5 % в 6,5 %.",
    permanentCorrection: "постоянная коррекция",
    // Группы формы (ADR 0102)
    groupLevels: "Постоянные уровни",
    groupLevelsHelp:
      "Заменяют значение Базы на весь прогноз. Объект с собственным темпом роста сохраняет его.",
    groupShocks: "Временные шоки",
    groupShocksHelp:
      "Добавляются к уровню на заданное число лет, затем возвращаются к тренду.",
    groupCrash: "Разовое падение цен",
    groupCrashHelp:
      "Однократно снижает стоимость всех объектов в выбранном году; рост продолжается с более низкой стоимости.",
    defaultYears: (n) => `по умолчанию ${n}`,
    zeroIsStart: (date) => `0 = начало прогноза (${date})`,
    none: "нет",
    invalidPct: "Неверный %",
    geOne: "≥ 1",
    geZero: "≥ 0",
    required: "Обязательно",
  },

  importPage: {
    title: "Импорт",
    subtitle: "Импорт данных портфеля из CSV файлов",
    propertiesTitle: "Объекты",
    valuationsTitle: "Оценки",
    rentsTitle: "Аренды / договоры",
    mortgagesTitle: "Ипотеки",
    chooseFile: "Выбрать файл…",
    dropHint: "или перетащите сюда CSV файл",
    reupload: (name) => `Загрузить заново ${name}`,
    downloadTemplate: "Скачать шаблон",
    rowsReady: (n) =>
      `${n} ${ruPlural(n, ["строка готова", "строки готовы", "строк готово"])}`,
    errorsBadge: (n) => `${n} ${ruPlural(n, ["ошибка", "ошибки", "ошибок"])}`,
    colRow: "Строка",
    colField: "Поле",
    colError: "Ошибка",
    importTitle: "Импорт",
    fixErrors: "Исправьте все ошибки выше перед импортом.",
    importSelected: "Импортировать выбранные файлы",
    importing: "Импорт…",
    importComplete: "Импорт завершён",
    reportTitle: "Отчёт об импорте",
    willAdd: (n) => `Будет добавлено: ${n}`,
    willUpdate: (n) => `Будет обновлено: ${n}`,
    added: (n) => `Добавлено: ${n}`,
    updated: (n) => `Обновлено: ${n}`,
    unchangedCount: (n) => `Без изменений: ${n}`,
    importScope: (total, added, updated) =>
      `Импортировать ${total} ${ruPlural(total, ["запись", "записи", "записей"])} (новых: ${added}, обновлений: ${updated})`,
    nothingToImport: "Все записи в этих файлах уже актуальны.",
    confirmOverwrite: (n) =>
      `Перезаписать ${n} ${ruPlural(n, ["существующую запись", "существующие записи", "существующих записей"])}`,
    confirmOverwriteMsg: (n) =>
      `Импорт изменит ${n} ${ruPlural(n, ["существующую запись", "существующие записи", "существующих записей"])}. Проверьте изменения выше.`,
    planChanged:
      "Данные изменились после предпросмотра, поэтому ничего не импортировано. Проверьте обновлённый предпросмотр и импортируйте снова.",
    errRequired: "Обязательно",
    errInvalidDate: (v) => `Неверная дата «${v}» — используйте YYYY-MM-DD`,
    errInvalidNumber: (v) => `Неверное число «${v}»`,
    errInvalidInteger: (v) => `Неверное целое «${v}»`,
    errInvalidBoolean: (v) =>
      `Неверное логическое «${v}» — используйте true или false`,
    errUnknownProperty: (v) => `Неизвестный объект «${v}»`,
    errInstalmentRequired:
      "Обязательно (или укажите loan_term_years для авторасчёта)",
    errImpossibleDate: (v) => `«${v}» — несуществующая календарная дата`,
    errDecimalComma: (v) =>
      `В «${v}» десятичная запятая — пишите числа с десятичной точкой и без пробелов (например, 4800000.40)`,
    errNegativeAmount: (v) => `Сумма «${v}» не может быть отрицательной`,
    errRateOutOfRange: (v) =>
      `Ставка «${v}» должна быть долей от нуля до единицы — 3,9 % пишите как 0.039`,
    errNotPositive: (v) =>
      `«${v}» — срок кредита должен быть не меньше одного года`,
    errOutOfRange: (v, min, max) =>
      `«${v}» должно быть целым числом от ${min} до ${max}`,
    errDuplicateKey: (firstRow) =>
      `Повтор строки ${firstRow} — каждая запись может встречаться в файле только один раз`,
    errMalformedRow: (expected, found) =>
      `В этой строке ${found} столбцов, в заголовке ${expected}`,
    errBadQuotes: "Незакрытые кавычки в этой строке",
    errNotUtf8:
      "Файл не в кодировке UTF-8 (вероятно, Windows-1250 из Excel) — сохраните его как «CSV UTF-8»",
    errSemicolon:
      "Файл разделён точками с запятой — сохраните его как «CSV UTF-8 (разделители — запятые)»",
    errFileTooLarge: (limitMb) => `Файл больше ${limitMb} МБ`,
    errTooManyRows: (limit) =>
      `В файле больше ${limit.toLocaleString("ru")} строк данных`,
    importRefused:
      "Ничего не импортировано. Исправьте эти строки и повторите импорт:",
    importFailed: (detail) =>
      `Импорт не удался и был отменён — ничего не импортировано. (${detail})`,
    templateFailed: (detail) => `Не удалось сохранить шаблон. (${detail})`,
    colFile: "Файл",
    wholeFile: "Файл",
  },

  backup: {
    exportTitle: "Экспорт копии",
    exportHint:
      "Сохраняет все объекты, ипотеки, оценки, аренды, допущения и сценарии",
    exportBody:
      "Экспортирует весь портфель в версионированный JSON файл. Используйте для снимка перед крупными изменениями.",
    exportButton: "Экспортировать копию…",
    lastBackup: (date: string, ago: string) =>
      `Последняя копия: ${date} (${ago})`,
    noBackupYet: "Резервная копия ещё не экспортировалась",
    agoToday: "сегодня",
    agoDays: (n: number) =>
      `${n} ${ruPlural(n, ["день", "дня", "дней"])} назад`,
    agoWeeks: (n: number) =>
      `${n} ${ruPlural(n, ["неделю", "недели", "недель"])} назад`,
    offDevice: "Храните копию не только на этом Mac.",
    exporting: "Экспорт…",
    restoreTitle: "Восстановить из копии",
    restoreHint: "Перезаписывает все текущие данные",
    restoreBody:
      "Выберите ранее экспортированный JSON файл для восстановления. Перед перезаписью автоматически сохранится резервная копия текущих данных.",
    chooseFile: "Выбрать файл копии…",
    restoreFrom: (file) => `Восстановить из ${file}?`,
    restoreWarning:
      "⚠ Это перезапишет все текущие данные (объекты, ипотеки, оценки, аренды, допущения и сценарии). Сначала будет сохранена резервная копия.",
    restoreNow: "Восстановить сейчас",
    restoring: "Восстановление…",
    errorTitle: "Ошибка",
    savedTo: (file) => `Копия сохранена в ${file}`,
    downloaded: "Копия скачана",
    restored: (file) =>
      `Портфель восстановлен. Прежние данные сохранены как ${file} в папке backups рядом с базой данных.`,
    exportFailed: (detail) =>
      `Не удалось сохранить резервную копию. (${detail})`,
    safetyBackupFailed: (detail) =>
      `Восстановление прервано: не удалось сохранить страховочную копию текущих данных, ничего не изменено. (${detail})`,
    restoreFailed: (detail) =>
      `Восстановление не удалось и было отменено — текущие данные не изменены. (${detail})`,
    backupDate: (date) => `Экспортировано ${date}`,
    olderVersion:
      "Создано более старой версией приложения; при восстановлении будет обновлено.",
    holds: "Файл содержит:",
    tables: {
      properties: "Объекты",
      mortgage_blocks: "Ипотеки",
      valuations: "Оценки",
      leases: "Аренды",
      holding_costs: "Расходы на содержание",
      assumptions: "Допущения",
      scenarios: "Сценарии",
    },
    errTooLarge: (limitMb) =>
      `Файл больше ${limitMb} МБ, значит это не резервная копия этого приложения.`,
    errNotJson: "Файл не является резервной копией в формате JSON.",
    errInvalid: (detail) =>
      `Файл не является корректной резервной копией этого приложения. (${detail})`,
    errNewer: (detail) =>
      `Эта копия создана более новой версией приложения (${detail}). Восстановите её в той версии.`,
    errRowsInvalid:
      "В копии есть записи, которые приложение не может восстановить. Ничего не изменено. Затронутые записи:",
    colTable: "Таблица",
    colRecord: "Запись",
    colColumn: "Столбец",
    colProblem: "Проблема",
    issueUnreadable: "Значение не читается",
    issueDuplicate: "Повторяет более раннюю запись",
    issueMissingAssumptions:
      "Файл должен содержать ровно одну запись допущений",
    issueOutOfRange: (min, max) =>
      `Должно быть целым числом от ${min} до ${max}`,
  },

  sample: {
    banner: "Вы смотрите демонстрационный портфель с вымышленными квартирами.",
    clearAction: "Удалить пример и начать свой",
    keepExploring: "Продолжить знакомство",
    dialogTitle: "Удалить демонстрационный портфель?",
    dialogDeletes:
      "Будут удалены три демонстрационные квартиры и все записи по ним — ипотеки, оценки, аренды и расходы, — включая добавленные вами.",
    dialogKeeps:
      "Объекты, которые вы добавили сами, ваши допущения и сценарии сохранятся.",
    dialogBackup:
      "Сначала будет сохранена страховочная копия всех текущих данных в папке backups рядом с базой данных.",
    confirm: "Удалить пример",
    clearing: "Удаление…",
    cleared: (file) =>
      `Пример удалён. Прежние данные сохранены как ${file} в папке backups рядом с базой данных.`,
    safetyBackupFailed: (detail) =>
      `Ничего не удалено: не удалось сохранить страховочную копию текущих данных. (${detail})`,
    clearFailed: (detail) =>
      `Удалить пример не удалось, изменения отменены — ваши данные не изменены. (${detail})`,
    panelTitle: "Демонстрационный портфель",
    panelHint: "Вымышленные квартиры, добавленные при первом запуске",
    panelBody:
      "Удалите демонстрационные квартиры, чтобы начать свой портфель. Объекты, добавленные вами, сохранятся.",
    gettingStartedTitle: "С чего начать",
    stepAssumptions: "Задайте допущения",
    stepAddProperty: "Добавьте объект",
    stepDetails: "Добавьте ипотеку, аренду и расходы",
    stepReview: "Просмотрите прогнозы",
    stepBackup: "Экспортируйте резервную копию",
  },
  xlsx: {
    exportToExcel: "Экспорт в Excel",
    exported: (name) => `Экспортировано ${name}`,
    exportFailed: (detail) => `Ошибка экспорта (${detail})`,
    // Excel sheet names (DR-152, UX-080): ≤ 31 characters, none of []:*?/\.
    sheetNames: {
      projection: "Прогноз",
      amortization: "График платежей",
      compareKeyFigures: "Ключевые цифры",
      compareNetWorth: "Чистые активы",
      compareNetCashFlow: "Чистый денежный поток",
      compareLtv: "LTV",
    },
    metric: "Показатель",
  },

  forms: {
    required: "Обязательно",
    invalidHint: {
      date: "Введите дату в формате dd.mm.yyyy",
      money: "Введите сумму 0 или больше, например 1 250 000",
      pct: "Введите процент, например 4,5",
      int: "Введите целое число, например 25",
      draws: "Один транш в строке: dd.mm.yyyy = сумма",
    },
    /** A bounded whole-number field (UX-068, ADR 0075). */
    intRange: (min: string, max: string) =>
      `Введите целое число от ${min} до ${max}`,
    drawsPlaceholder: "dd.mm.yyyy = сумма  (один транш в строке)",
    datePlaceholder: "dd.mm.yyyy",
    defaultPlaceholder: "по умолчанию",
  },

  propertyForm: {
    addTitle: "Добавить объект",
    editTitle: "Изменить объект",
    name: "Название",
    address: "Адрес",
    type: "Тип",
    typeHelp: "напр. 1 спальня, 2 спальни",
    size: "Площадь (m²)",
    garage: "Гараж",
    garageYes: "Да",
    purchaseDate: "Дата покупки",
    purchasePrice: "Цена покупки",
    appreciationOverride: "Своя ставка роста",
    rentIndexOverride: "Своя индексация аренды",
    overrideHelp: "Оставьте пустым для глобального значения из Допущений",
    errRequired: "Обязательно",
    errNameExists: "Объект с таким названием уже существует",
    errUseDate: "Используйте dd.mm.yyyy",
    errInvalidNumber: "Неверное число",
    errWholeNumber: "Должно быть целым числом",
    errInvalidPercentage: "Неверный процент",
  },

  projGrid: {
    /** One-letter "year" prefix for "Y5 · 2031" labels (UX-032). */
    yearPrefix: "Г",
    year: "Год",
    opening: "начало",
    period: "Период",
    value: "Стоимость",
    debt: "Долг",
    equity: "Капитал",
    ltv: "LTV",
    grossRent: "Валовая аренда",
    effective: "Эффективная",
    holding: "Расходы",
    noi: "NOI",
    interest: "Проценты",
    principal: "Тело",
    debtSvc: "Обсл. долга",
    netCf: "Чистый ДП",
    dscr: "DSCR",
    caption: "Прогноз по годам",
  },

  about: {
    title: "О приложении",
    subtitle: APP_NAME,
    version: (v: string) => `Версия ${v}`,
    tagline: "Локальный трекер вашего портфеля арендных квартир.",

    appTitle: "Что умеет приложение",
    appBody:
      "Отслеживайте свои арендные квартиры в одном месте: текущую стоимость, долг и капитал, аренду, расходы на содержание и денежный поток. Приложение строит прогноз в номинальном и реальном выражении на выбранный горизонт (по умолчанию 30 лет), показывает показатели LTV, DSCR, доходности и IRR и позволяет проверять портфель сценариями «что если».",
    formatsNote:
      "Язык меняет только текст интерфейса. Суммы всегда указаны в чешских кронах (Kč) в чешском формате чисел и дат.",

    privacyTitle: "Приватность по умолчанию",
    privacyBody:
      "Всё работает офлайн на вашем Mac. Портфель хранится в локальной базе SQLite — без аккаунтов, без облака, без аналитики. Ваши данные никогда не покидают устройство.",

    developerTitle: "Разработчик",
    developerName: "Vlastimil Bureš",
    feedbackLabel: "Обратная связь",
    feedbackText: "github.com/vlastimilbures/real-estate-tracker/issues",
    sourceLabel: "Исходный код",
    sourceText: "github.com/vlastimilbures/real-estate-tracker",
    limitsLabel: "Ограничения модели",
    limitsText:
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/model-limitations.md",
    dataSafetyLabel: "Безопасность данных",
    dataSafetyText:
      "github.com/vlastimilbures/real-estate-tracker/blob/main/docs/data-safety.md",

    builtWithTitle: "Создано на",
    builtWithBody: "Tauri 2 · React · TypeScript · SQLite · decimal.js",
    precisionNote:
      "Деньги считаются точной десятичной арифметикой (никогда не плавающей точкой). Результаты проверяются по эталонным значениям с допуском ±1 Kč.",

    copyright: "© 2026 Vlastimil Bureš",
    usageNote: "Создано для личного использования.",
  },

  guide: {
    title: "Справка",
    subtitle: "Как считаются числа и что они означают",
    eg: "напр.",
    howItWorksTitle: "Как это работает",
    howItWorksHint: "От ваших данных к числам на экране",
    cardFlowTitle: "Односторонний поток данных",
    cardFlowBody:
      "Ваши записи проходят через чистый расчётный движок, затем экраны показывают результат. Ни одно число не вводится вручную — каждое выводится.",
    cardAsOfTitle: "Всё «на» определённую дату",
    cardAsOfBody:
      "Снимок — это ваш портфель на выбранный день; прогноз катит его вперёд по годам. Снимок на базовую дату равен году 0 прогноза.",
    cardEffectiveTitle: "Записи действуют по датам",
    cardEffectiveBody:
      "Оценки, аренды и ипотеки имеют диапазон дат. Для любого дня движок берёт действующую запись — так истекающая аренда передаёт эстафету следующей.",
    snapshotTitle: "Показатели снимка",
    snapshotHint: "Текущая картина объекта или портфеля",
    snapshotProse:
      "Итоги портфеля суммируют только объекты, которыми вы сейчас владеете и которые активны; коэффициенты вроде LTV и DSCR портфеля выводятся из этих итогов. Деактивация лишь исключает объект: она не фиксирует продажу, выручку от продажи или погашение кредита.",
    mortgagesTitle: "Ипотеки и фиксация",
    mortgagesHint: "Как меняется остаток кредита со временем",
    mortgagesProse1Pre: "Кредиты — это ",
    mortgagesProse1Annuities: "аннуитеты",
    mortgagesProse1Mid:
      " — постоянный месячный платёж, сначала разбитый на проценты: ",
    fInterest: "проценты = остаток × ставка ÷ 12",
    fPrincipal: "тело = платёж − проценты",
    fNewBalance: "новый остаток = остаток − тело",
    mortgagesProse1Post:
      ". Поначалу платёж — в основном проценты; по мере сокращения остатка больше идёт на тело, а платёж остаётся прежним.",
    mortgagesProse2Pre: "У чешских ипотек есть ",
    mortgagesProse2Fixation: "период фиксации",
    mortgagesProse2Mid:
      " — годы, когда ставка зафиксирована. Когда он кончается, ставка ",
    mortgagesProse2Resets: "сбрасывается",
    mortgagesProse2Mid2: " на вашу ставку после фиксации, и платёж ",
    mortgagesProse2Reamortizes: "переамортизируется",
    mortgagesProse2Post:
      ", чтобы погасить остаток за оставшийся срок, так что платёж к этой дате может вырасти или снизиться.",
    projectionTitle: "Прогноз до горизонта",
    projectionHint: "Прокрутка снимка вперёд",
    projectionProse1:
      "Каждый вход растёт вперёд, год за годом, до горизонта (по умолчанию 30 лет, задаётся в Настройки → Допущения):",
    projectionProse2:
      "Объект или аренда, начинающиеся в середине года, пропорционально учитываются за первый год. Встроенная проверка: если все кредиты погашаются в пределах горизонта, сумма погашенного тела равна начальному долгу плюс последующие выборки — не больше и не меньше. Выводы включают первый год с положительным потоком и год без долга.",
    nominalRealTitle: "Номинальные vs реальные",
    nominalRealHint: "Переключатель на Обзоре и Прогнозах",
    nominalRealProsePre:
      "Номинальные значения — это будущие кроны по номиналу. Реальные значения убирают инфляцию, показывая покупательную способность на базовую дату (начало прогноза): ",
    fCpi: "CPI = Π (1 + инфляция)",
    fReal: "реальное = номинальное ÷ CPI",
    nominalRealProsePost:
      ". При инфляции 2,5% 1,0 M через 30 лет стоит ≈ 477 k в деньгах на базовую дату.",
    nominalRealTodayNote:
      "Реальные значения приводятся к началу прогноза, поэтому снимок «Сегодня» с более поздней датой немного ниже номинального значения. Так и задумано.",
    returnsTitle: "Доходность за горизонт",
    returnsHint: "Рост и денежный поток одним числом",
    scenariosTitle: "Сценарии",
    scenariosHint: "Тесты «что если» без изменения ваших данных",
    scenariosProse:
      "Сценарий переопределяет только допущения — никогда ваши реальные объекты или ипотеки — так что можно свободно сравнивать и возвращаться назад. Помимо постоянных настроек (рост, индексация, простой, ставка после фиксации, инфляция) можно применить временные шоки:",
    developmentTitle: "Строящиеся объекты",
    developmentHint: "Строительство, финансируемое траншами",
    developmentProsePre:
      "Строящийся объект может финансироваться строительным кредитом, выбираемым ",
    developmentTranches: "траншами",
    developmentProseMid: ". Во время строительства кредит ",
    developmentInterestOnly: "только под проценты",
    developmentProsePost:
      " (без тела), и стоимость растёт с долей выбранного на данный момент кредита. Когда приходит транш или строительство завершается, кредит переамортизируется в обычный график погашения.",
    limitsTitle: "Ограничения и безопасность данных",
    limitsProse:
      "Эти цифры — плановые оценки, а не предложение банка и не гарантированный результат. Два документа в репозитории исходного кода объясняют, что модель упрощает или не учитывает, и как сделать резервную копию данных и восстановить их после неудачного обновления.",
    glossaryTitle: "Глоссарий",
    snapshotDefs: {
      value: {
        name: "Стоимость",
        formula: "оценка × (1 + рост) ^ годы",
        meaning:
          "Рыночная стоимость, выросшая от последней записанной оценки. Новая оценка переякоривает кривую.",
        eg: "5,0 M при 4%/год → 5,0 M × 1,04² ≈ 5,41 M через 2 года.",
      },
      debt: {
        name: "Долг",
        formula: "остаток на дату",
        meaning:
          "Оставшийся остаток кредита из графика амортизации — отражает каждый платёж и любой сброс ставки.",
      },
      equity: {
        name: "Капитал",
        formula: "стоимость − долг",
        meaning:
          "Сколько объект стоит для вас после погашения банка — ваша чистая доля.",
        eg: "5,41 M − 2,6 M = 2,81 M.",
      },
      ltv: {
        name: "LTV",
        formula: "долг ÷ стоимость",
        meaning:
          "Доля объекта, профинансированная банком. Ниже = безопаснее подушка против падения цены.",
        eg: "2,6 M ÷ 5,4 M ≈ 48% финансировано.",
      },
      grossRent: {
        name: "Валовая годовая аренда",
        formula: "месячная аренда × 12",
        meaning: "Годовая аренда до пустых месяцев и расходов.",
        eg: "20 k/мес × 12 = 240 k.",
      },
      effectiveIncome: {
        name: "Эффективный валовой доход",
        formula: "валовая аренда × (1 − простой)",
        meaning:
          "Аренда, которую вы реально собираете, с учётом иногда пустующей квартиры.",
        eg: "240 k × (1 − 5%) = 228 k.",
      },
      holdingCosts: {
        name: "Расходы на содержание",
        formula: "фикс. + (управл.% + обсл.%) × валовая аренда",
        meaning:
          "Годовой текущий расход: фиксированные статьи (налог, страховка, SVJ, прочее) плюс управление и обслуживание как % от аренды.",
        eg: "36 k + (15%+5%)×240 k = 84 k.",
      },
      noi: {
        name: "NOI",
        formula: "эффективный доход − расходы на содержание",
        meaning:
          "Операционная прибыль до ипотеки — деньги, которые приносит сам актив.",
        eg: "228 k − 84 k = 144 k.",
      },
      debtService: {
        name: "Годовое обслуживание долга",
        formula: "месячный платёж × 12",
        meaning: "Суммарные платежи по ипотеке за год (проценты плюс тело).",
        eg: "10 k/мес → 120 k.",
      },
      netCashFlow: {
        name: "Чистый денежный поток",
        formula: "NOI − обслуживание долга",
        meaning:
          "Модельный годовой денежный поток после расходов и ипотеки — оценка, а не выписка с банковского счёта. Может быть отрицательным.",
        caveat: "Это не фактические поступления.",
        eg: "144 k − 120 k = +24 k.",
      },
      dscr: {
        name: "DSCR",
        formula: "NOI ÷ обслуживание долга",
        meaning:
          "Покрывает ли аренда ипотеку. Выше 1,0 объект сам платит свой кредит; ниже — вы доплачиваете.",
        eg: "144 k ÷ 120 k = 1,20× (20% запаса).",
      },
      grossYield: {
        name: "Валовая доходность",
        formula: "валовая аренда ÷ стоимость",
        meaning:
          "Аренда как % стоимости, без расходов и долга — быстрое число для сравнения.",
        eg: "240 k ÷ 5,4 M ≈ 4,4%.",
      },
      netYield: {
        name: "Чистая доходность (cap rate)",
        formula: "NOI ÷ стоимость",
        meaning:
          "Доходность от стоимости после текущих расходов, без ипотеки — стандартное сравнение.",
        eg: "144 k ÷ 5,4 M ≈ 2,7%.",
      },
      weightedAvgRate: {
        name: "Средневзвешенная ставка",
        formula: "Σ(долг × ставка) ÷ общий долг",
        meaning:
          "Смешанная стоимость заимствования по всем ипотекам, взвешенная так, что крупные кредиты весят больше.",
        eg: "1 M@2% + 3 M@4% → 3,5%.",
      },
    },
    projectionDefs: {
      value: {
        name: "Стоимость",
        formula: "растёт на ставку роста",
        meaning: "Растёт каждый год на ставку роста стоимости.",
      },
      rent: {
        name: "Аренда",
        formula: "по договорам аренды, с индексацией",
        meaning:
          "Следует вашим договорам аренды помесячно. Разрыв между договорами ничего не приносит, последний договор считается продлённым, а каждый договор индексируется с даты своего начала.",
      },
      vacancy: {
        name: "Простой",
        formula: "применяется каждый год",
        meaning: "Резерв на простой берётся с аренды каждый год, как в снимке.",
      },
      costs: {
        name: "Расходы",
        formula: "растут с CPI",
        meaning:
          "Расходы на содержание растут через индекс CPI, построенный из ставки инфляции.",
      },
      debt: {
        name: "Долг",
        formula: "график амортизации",
        meaning: "Следует графику, включая сбросы после фиксации.",
      },
      nextReset: {
        name: "Следующая смена ставки",
        formula: "начало + годы фиксации",
        meaning:
          "Ближайший расчётный конец фиксации и остаток по графику после платежа в этот день. Этот остаток переходит на ставку после фиксации.",
        caveat: "Рассчитано по внесённым кредитам, это не дата от банка.",
      },
      debtResetting: {
        name: "Долг со сменой ставки за N лет",
        formula: "Σ остатков на концах фиксации в периоде",
        meaning:
          "Сколько долга дойдёт до конца фиксации в ближайшие 1, 3 или 5 лет; каждый конец фиксации считается один раз.",
      },
      totalInterest: {
        name: "Проценты всего",
        formula: "Σ процентов, годы 1…N",
        meaning:
          "Все проценты, уплаченные в прогнозе до горизонта. Реальный режим дефлирует проценты каждого года индексом инфляции этого года.",
      },
    },
    returnsDefs: {
      multiple: {
        name: "Множитель чистых активов",
        formula: "капитал на горизонте ÷ капитал на начало прогноза",
        meaning:
          "Во сколько раз ожидается рост вашего капитала на начало прогноза к горизонту.",
        eg: "22 M → 110 M = 5,0×.",
      },
      cagr: {
        name: "CAGR",
        formula: "(конец ÷ начало) ^ (1 ÷ годы) − 1",
        meaning:
          "Сглаженная устойчивая годовая ставка роста от начальной до конечной стоимости.",
        eg: "5× за 30 лет ≈ 5,5%/год.",
      },
      irr: {
        name: "IRR с плечом",
        formula: "ставка, где NPV = 0",
        meaning:
          "Годовая доходность от начала прогноза: капитал на эту дату считается вложенной суммой, плюс годовые денежные потоки и прогнозный капитал на горизонте (без расходов на продажу и налогов), с ипотекой в расчёте.",
        caveat: "Это не доходность ваших исходных денег, вложенных в покупку.",
        eg: "сначала отрицательно, крупный капитал на горизонте → ≈ 6%/год.",
      },
    },
    scenarioDefs: {
      inflationShock: {
        name: "Шок инфляции",
        formula: "+Δ на N лет",
        meaning: "Временный скачок инфляции, затем обратно к тренду.",
      },
      rateShock: {
        name: "Шок ставки",
        formula: "+Δ вокруг рефикса",
        meaning: "Повышенная ставка вокруг сброса фиксации на заданный период.",
      },
      valueCrash: {
        name: "Обвал стоимости",
        formula: "разовое падение в году Y",
        meaning:
          "Разовое падение стоимости; рост возобновляется с более низкой базы. Обвал в начале прогноза снижает начальный капитал, поэтому процентная доходность может расти, пока ваше состояние падает.",
      },
    },
    glossary: {
      noi: {
        term: "NOI",
        def: "Чистый операционный доход: эффективная аренда − расходы на содержание.",
      },
      dscr: {
        term: "DSCR",
        def: "NOI ÷ обслуживание долга. Выше 1 = аренда покрывает ипотеку.",
      },
      ltv: { term: "LTV", def: "Loan-to-value: долг ÷ стоимость." },
      capRate: {
        term: "Cap rate / чистая доходность",
        def: "NOI ÷ стоимость.",
      },
      grossYield: {
        term: "Валовая доходность",
        def: "Валовая аренда ÷ стоимость.",
      },
      equity: { term: "Капитал", def: "Стоимость − долг; ваша чистая доля." },
      egi: {
        term: "Эффективный валовой доход",
        def: "Валовая аренда после резерва на простой.",
      },
      annuity: {
        term: "Аннуитет",
        def: "Постоянный платёж; сначала больше процентов, позже больше тела.",
      },
      fixation: {
        term: "Фиксация",
        def: "Годы, на которые зафиксирована ставка чешской ипотеки.",
      },
      reset: {
        term: "Сброс / переамортизация",
        def: "В конце фиксации ставка меняется и платёж пересчитывается.",
      },
      svj: {
        term: "SVJ / фонд ремонта",
        def: "Фонд ремонта дома (месячный расход).",
      },
      propertyTax: {
        term: "Daň z nemovitých věcí",
        def: "Годовой налог на недвижимость.",
      },
      cagr: { term: "CAGR", def: "Сложная годовая (сглаженная) ставка роста." },
      irr: {
        term: "IRR",
        def: "Единая годовая доходность, балансирующая вектор денежных потоков.",
      },
      nominal: { term: "Номинальные", def: "Будущие кроны по номиналу." },
      real: {
        term: "Реальные",
        def: "Покупательная способность на базовую дату (без инфляции).",
      },
    },
  },
};
