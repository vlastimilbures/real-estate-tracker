// ADR 0270: errors are told apart by their code, never by their text. A Rust failure is a
// CommandError with a code (and a constraint's fields), so no production TypeScript
// compares an error to a string literal or matches a driver's message: a reworded
// message, from Rust or from an sqlx or SQL plugin upgrade, cannot change what the user
// sees. Comments are not code, so they may still quote a message.
//
// How much it proves: the bans on a driver's text (SQLite's "constraint failed", sqlx's
// wrapper) are the solid part, since no production code needs those words. The rules on
// comparisons and searches are a tripwire keyed on names (a catch parameter called `e`,
// `err` or `error`; `messageOf(…)`; `.message`): code that names its error otherwise
// slips past them, so review still matters.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = join(__dirname, "..");

/** Every production .ts/.tsx file under src: no tests, no test support. */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : sources(p);
    return /\.tsx?$/.test(f) && !/\.(test|spec|bench)\.tsx?$/.test(f)
      ? [p]
      : [];
  });
}

/** The code without its comments (a string holding `//` is rare enough to accept). */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** What reads an error's text to decide what it is. */
const MATCHING: [string, RegExp][] = [
  ["a SQLite constraint message", /constraint failed/i],
  ["sqlx's wrapper", /error returned from database/i],
  [
    "a caught value compared to a string",
    // A catch parameter's usual names; `typeof e` is a type check, not a match.
    /(?<!typeof\s)\b(e|err|error)\s*[!=]==?\s*["'`]/,
  ],
  [
    "an error's message searched",
    /messageOf\([^)]*\)\s*\.\s*(includes|startsWith|endsWith|match|search)\b|\.(test|exec)\(\s*messageOf\(/,
  ],
  [
    "an error's message searched",
    /\b(e|err|error)\.message\s*\.\s*(includes|startsWith|endsWith|match|search)\b/,
  ],
];

describe("errors are matched on codes, not text (ADR 0270)", () => {
  it("no production file reads an error's text to tell what it is", () => {
    const found = sources().flatMap((file) => {
      const text = code(readFileSync(file, "utf8"));
      return MATCHING.filter(([, re]) => re.test(text)).map(
        ([what]) => `${file.slice(SRC.length + 1)}: ${what}`,
      );
    });
    expect(found).toEqual([]);
  });

  it("would catch each kind of match", () => {
    expect(MATCHING.some(([, re]) => re.test(`typeof e === "object"`))).toBe(
      false,
    );
    const samples = [
      `if (e === "BACKUP_TOO_LARGE") throw x;`,
      `const UNIQUE = /UNIQUE constraint failed: (\\w+)/;`,
      `text.includes("error returned from database")`,
      `if (messageOf(e).includes("locked")) retry();`,
      `if (err.message.startsWith("BACKUP_")) skip();`,
    ];
    for (const s of samples)
      expect(
        MATCHING.some(([, re]) => re.test(code(s))),
        s,
      ).toBe(true);
    expect(code(`// SQLite says "CHECK constraint failed: x"`).trim()).toBe("");
  });
});
