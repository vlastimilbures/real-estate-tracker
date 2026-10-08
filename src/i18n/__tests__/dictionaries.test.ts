// P3 i18n completeness: en/cs/ru must expose identical key sets with the same leaf kind
// and function arity, and every leaf must render. `Dictionary = typeof en` already makes
// tsc reject a missing key; this also catches kind/arity drift, empty strings and
// interpolations that print "undefined"/"NaN". Plural coverage is pinned as today's.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { en } from "../en";
import { cs } from "../cs";
import { ru } from "../ru";

type Tree = { [k: string]: unknown };
const DICTS = { en, cs, ru } as const;
type Lang = keyof typeof DICTS;
const LANGS = Object.keys(DICTS) as Lang[];

function leaves(t: Tree, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(t)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [kk, vv] of leaves(v as Tree, `${prefix}${k}.`))
        out.set(kk, vv);
    } else {
      out.set(`${prefix}${k}`, v);
    }
  }
  return out;
}

const L = Object.fromEntries(
  LANGS.map((l) => [l, leaves(DICTS[l] as unknown as Tree)]),
) as Record<Lang, Map<string, unknown>>;

type Fn = (...args: unknown[]) => unknown;
const render = (f: unknown, n: number) => String((f as Fn)(n, n, n));
const kind = (v: unknown) =>
  typeof v === "function" ? `function/${(v as Fn).length}` : typeof v;

/** Year ranges ("Yrs 1–n") hold a literal 1 that collides with the count 1 (ADR 0084);
 *  so does the monthly hint's "÷ 12" (ADR 0088). */
const RANGE_LABELS = new Set([
  "dashboard.kpiCumulativeNetCashFlow",
  "dashboard.kpiSumPrincipalRepaid",
  "dashboard.kpiSumPrincipalRepaidNominal",
  "dashboard.monthlyHint",
  // "Yrs 1–N" (ADR 0103).
  "dashboard.financingTotalInterest",
  "dashboard.financingTotalInterestReal",
  // The accepted CSV spellings "1/0" (ADR 0113).
  "importPage.errInvalidBoolean",
]);

/** Keys whose output changes form (not just the digit) across counts 1 / 2 / 5. */
function countInflected(lang: Lang): string[] {
  return [...L[lang]]
    .filter(([k, v]) => typeof v === "function" && !RANGE_LABELS.has(k))
    .filter(
      ([, v]) =>
        new Set([1, 2, 5].map((n) => render(v, n).split(String(n)).join("#")))
          .size > 1,
    )
    .map(([k]) => k);
}

describe("i18n dictionaries — completeness", () => {
  it("en, cs and ru have identical key sets", () => {
    const keys = [...L.en.keys()].sort();
    expect(keys.length).toBeGreaterThan(600);
    for (const l of LANGS) expect([...L[l].keys()].sort(), l).toEqual(keys);
  });

  it("every key has the same leaf kind and function arity in all languages", () => {
    for (const [k, v] of L.en)
      for (const l of LANGS)
        expect(kind(L[l].get(k)), `${l} ${k}`).toBe(kind(v));
  });

  it("no string leaf is empty", () => {
    for (const l of LANGS)
      for (const [k, v] of L[l])
        if (typeof v === "string")
          expect(v.trim().length, `${l} ${k}`).toBeGreaterThan(0);
  });

  it("every function leaf renders without 'undefined' / 'NaN' for counts 0…25", () => {
    for (const l of LANGS)
      for (const [k, v] of L[l])
        if (typeof v === "function")
          for (let n = 0; n <= 25; n++) {
            const s = render(v, n);
            expect(s.trim().length, `${l} ${k}(${n})`).toBeGreaterThan(0);
            expect(s, `${l} ${k}(${n})`).not.toMatch(/undefined|NaN/);
          }
  });
});

// DR-149: every key has a caller. Components alias a namespace (`const tb = t.backup;
// tb.title`), so a key counts as used when a non-test source file reads it as
// `.ns.key` or through such an alias. Namespaces read by a computed key
// (`t.nav[n.navKey]`, `t.dataErrors[e.code]`) count a key as used when the source names
// it: the item list's `navKey: "dashboard"`, or the error code's `"DB_INTEGRITY"` literal.
const COMPUTED: Record<string, (k: string) => string> = {
  dataErrors: (k) => `"${k}"`,
  inputRules: (k) => `"${k}"`,
  nav: (k) => `navKey: "${k}"`,
  shell: (k) => `labelKey: "${k}"`,
};

/** Non-test app sources outside src/i18n (the dictionaries define keys, never read them). */
function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(
      (f) =>
        /\.tsx?$/.test(f) &&
        !/__tests__|\.test\./.test(f) &&
        !f.startsWith("i18n"),
    )
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

describe("i18n dictionaries — usage", () => {
  it("every key is read by the app (DR-149)", () => {
    const files = sources(join(__dirname, "..", ".."));
    // Aliases of a namespace per file, scanned once per namespace (not once per key).
    const aliasCache = new Map<string, string[][]>();
    const aliasesOf = (ns: string): string[][] => {
      let hit = aliasCache.get(ns);
      if (!hit) {
        const alias = new RegExp(
          `(\\w+)\\s*(?:=\\s*[\\w.()]*\\.${ns};|:\\s*Dictionary\\["${ns}"\\])`,
          "g",
        );
        hit = files.map((f) => [...f.matchAll(alias)].map(([, a = ""]) => a));
        aliasCache.set(ns, hit);
      }
      return hit;
    };
    const used = (i: number, ns: string, rest: string): boolean => {
      const f = files[i] ?? "";
      // `t.ns.rest`, or an alias: `const x = t.ns;` / `x: Dictionary["ns"]`, then `x.rest`.
      if (new RegExp(`\\.${ns}\\.${rest}\\b`).test(f)) return true;
      return (aliasesOf(ns)[i] ?? []).some((a) =>
        new RegExp(`\\b${a}\\.${rest}\\b`).test(f),
      );
    };
    const unused = [...L.en.keys()].filter((key) => {
      const [ns = "", ...rest] = key.split(".");
      // A leaf list (`monthsShort`) is read by index.
      if (rest.length === 0)
        return !files.some((f) => new RegExp(`\\.${ns}\\b`).test(f));
      const named = COMPUTED[ns];
      if (named && files.some((f) => f.includes(named(rest[0] ?? ""))))
        return false;
      // A nested object read whole (`b.tables[table]`, `[sd.value, sd.debt]`) uses its leaves.
      return !rest.some((_, i) =>
        files.some((_f, fi) => used(fi, ns, rest.slice(0, i + 1).join("\\."))),
      );
    });
    expect(unused).toEqual([]);
  });
});

describe("i18n dictionaries — plural forms", () => {
  it("Czech count strings use one / few / many (1 · 2–4 · 0, 5+)", () => {
    const f = L.cs.get("importPage.errorsBadge");
    expect([1, 2, 4, 5, 0].map((n) => render(f, n))).toEqual([
      "1 chyba",
      "2 chyby",
      "4 chyby",
      "5 chyb",
      "0 chyb",
    ]);
  });

  it("Russian count strings follow CLDR incl. the 11–14 exception", () => {
    const f = L.ru.get("importPage.errorsBadge");
    expect([1, 2, 5, 11, 21, 22].map((n) => render(f, n))).toEqual([
      "1 ошибка",
      "2 ошибки",
      "5 ошибок",
      "11 ошибок",
      "21 ошибка",
      "22 ошибки",
    ]);
  });

  it("every language inflects the same count strings (DR-111, UX-034)", () => {
    const rest = [
      "properties.subtitle",
      "propertyDetail.yrs",
      "propertyDetail.draws",
      "propertyDetail.monthsCount",
      // Amortization disclosure (ADR 0107).
      "propertyDetail.showAmortization",
      "propertyDetail.amortizationMonths",
      // Rate shock reach (ADR 0100).
      "scenarios.reachHits",
      "importPage.rowsReady",
      "importPage.errorsBadge",
      "importPage.importScope",
      "importPage.confirmOverwrite",
      "importPage.confirmOverwriteMsg",
      // Backup recency (ADR 0110).
      "backup.agoDays",
      "backup.agoWeeks",
      // Out-of-range values a restore asks about (ADR 0148).
      "backup.warnOutOfRange",
    ];
    // Error summary count (ADR 0095); every property deactivated (ADR 0155); the backup
    // reminder's age (ADR 0110).
    const common = [
      "common.fieldsNeedAttention",
      "common.allInactiveTitle",
      "shell.backupHintOld",
    ];
    // Financing & upcoming panel (ADR 0103).
    const financing = [
      "dashboard.financingResettingWithin",
      "dashboard.financingResettingWithinNominal",
      "dashboard.financingLoans",
    ];
    const counted = [...common, ...financing, ...rest];
    // English writes the horizon and the IRR foot as compounds ("25-yr"); Czech and
    // Russian count years.
    const withIrrFoot = [
      ...common,
      "dashboard.netWorthInYear",
      "dashboard.irrFoot",
      ...financing,
      ...rest,
    ];
    expect(countInflected("en")).toEqual(counted);
    expect(countInflected("ru")).toEqual(withIrrFoot);
    // Czech "čerpání" is the same for every count (1 · 2 · 5 čerpání).
    expect(countInflected("cs")).toEqual(
      withIrrFoot.filter((k) => k !== "propertyDetail.draws"),
    );
  });

  it("horizon years inflect in every language (ADR 0084, ADR 0088)", () => {
    const f = (l: Lang) => (n: number) =>
      String((L[l].get("dashboard.netWorthInYear") as Fn)(2056, n));
    expect(f("en")(1)).toBe("Net worth in 2056 (1-yr horizon)");
    expect([1, 2, 5].map(f("cs"))).toEqual([
      "Čisté jmění v roce 2056 (horizont 1 rok)",
      "Čisté jmění v roce 2056 (horizont 2 roky)",
      "Čisté jmění v roce 2056 (horizont 5 let)",
    ]);
    expect([1, 2, 5, 21].map(f("ru"))).toEqual([
      "Чистые активы в 2056 г. (горизонт 1 год)",
      "Чистые активы в 2056 г. (горизонт 2 года)",
      "Чистые активы в 2056 г. (горизонт 5 лет)",
      "Чистые активы в 2056 г. (горизонт 21 год)",
    ]);
    for (const l of LANGS) {
      for (const k of [
        "dashboard.trajectory",
        "dashboard.kpiCumulativeNetCashFlow",
        "dashboard.kpiSumPrincipalRepaid",
        "propertyDetail.projectionTitle",
      ]) {
        const out = render(L[l].get(k), 25);
        expect(out, `${l} ${k}`).toContain("25");
        expect(out, `${l} ${k}`).not.toContain("30");
      }
    }
  });

  it("English and Czech singulars read naturally (DR-111)", () => {
    expect(render(L.en.get("importPage.rowsReady"), 1)).toBe("1 row ready");
    expect(render(L.en.get("importPage.errorsBadge"), 1)).toBe("1 error");
    expect(render(L.en.get("propertyDetail.yrs"), 1)).toBe("1 yr");
    expect(
      [1, 2, 5].map((n) => render(L.cs.get("propertyDetail.yrs"), n)),
    ).toEqual(["1 rok", "2 roky", "5 let"]);
  });
});

describe("i18n dictionaries — CSV messages", () => {
  it("names an out-of-range whole number with its bounds (UX-069, ADR 0076)", () => {
    const msg = (l: Lang) => DICTS[l].importPage.errOutOfRange("51", "0", "50");
    expect(msg("en")).toBe('"51" must be a whole number from 0 to 50');
    expect(msg("cs")).toBe("„51“ musí být celé číslo od 0 do 50");
    expect(msg("ru")).toBe("«51» должно быть целым числом от 0 до 50");
  });
});

// DR-152 (UX-080, ADR 0080): Excel sheet names follow the UI language and stay valid
// for Excel: 1–31 characters, none of []:*?/\ and no leading or trailing apostrophe.
describe("Excel sheet names", () => {
  it.each(LANGS)("%s names are valid Excel sheet names", (lang) => {
    const names = Object.values(DICTS[lang].xlsx.sheetNames);
    // Projection, Amortization and the four Scenario compare sheets (ADR 0108).
    expect(names).toHaveLength(6);
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(31);
      expect(name).not.toMatch(/[[\]:*?/\\]/);
      expect(name).not.toMatch(/^'|'$/);
    }
  });
  it("cs and ru names are translated", () => {
    expect(cs.xlsx.sheetNames.projection).not.toBe(
      en.xlsx.sheetNames.projection,
    );
    expect(ru.xlsx.sheetNames.amortization).not.toBe(
      en.xlsx.sheetNames.amortization,
    );
  });
});
