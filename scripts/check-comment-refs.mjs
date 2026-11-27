// Comment references (#457, `pnpm lint`): a comment cites a decision as `ADR nnnn`, and
// that ADR has a file in docs/adr. Ids from the retired refactor archive (DR-nnn, UX-nnn,
// J-nn, Q-nn, D-nn, the C-/F-/H- finding ids, phase ids such as P5b) point at documents
// that are not in the repository, so they are refused. In the app's source (src and
// src-tauri/src), so is an issue number (`#nnn`) unless the issue is on
// CITED_OPEN_ISSUES: a closed issue's number tells the reader nothing the sentence does
// not. In code only comments are read: the TypeScript scanner finds them in .ts/.tsx
// (strings, templates and JSX text are not comments), a small lexer in .rs, and
// `/* … */` in .css. The living docs (SPEC, README, CONTRIBUTING, docs/ and the capture
// README) are read whole; the append-only history (ADRs, the wording log, review records,
// the changelog) is not. Tests are out of scope: their comments name cases, not
// decisions. The reference models and the capture harness are read for ids and ADRs.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The retired id families, each as a whole word. */
const ARCHIVE_ID = /\b(?:(?:DR|UX|J|Q|D|C|F|H)-\d+[a-z]?|P\d+[a-z]?)\b/g;
const ADR_CITE = /\bADR (\d{4})\b/g;
/** `#nnn`, not an HTML entity (`&#123;`) or a digit-only hex colour (`#202427`). */
const ISSUE_REF = /(?<![\w&#])#(\d{2,4})\b/g;
/** A backtick code span: it quotes a value (a colour such as `#666`), not an issue. */
const CODE_SPAN = /`[^`\n]*`/g;

/**
 * The open issues a comment may cite, each where the code still carries its debt. The
 * list is kept here, not read from GitHub, so the check runs offline (CI has no
 * network): the pull request that closes one of these issues removes its number, and
 * the check then names every comment that still cites it.
 */
export const CITED_OPEN_ISSUES = new Set([
  476, // loan/blockChain.ts: the chain's block/successor pairs
  482, // import/columns.ts: the CSV column list
  611, // validate/loan.ts: a loan below its interest that still loads
]);

/** The folders the check walks, and the files it reads at the top level. */
const WALKED = ["src", "src-tauri/src", "docs", "ux-capture"];
const TOP_FILES = [
  "README.md",
  "CONTRIBUTING.md",
  "SPEC.md",
  "src-tauri/build.rs",
];
const IS_TEST = /\.test\.tsx?$/;
/** The append-only history under docs: kept as written. */
const DOC_HISTORY = /^docs\/(?:adr\/|reviews\/|decisions\/wording\.md$)/;

/** App source: .ts, .tsx and .css under src and .rs under src-tauri/src, without tests
 *  and test support. Every rule applies, the issue rule included. */
function isAppSource(path) {
  if (/^src-tauri\/(?:src\/.*\.rs|build\.rs)$/.test(path)) return true;
  return (
    path.startsWith("src/") &&
    !path.includes("/__tests__/") &&
    /\.(ts|tsx|css)$/.test(path) &&
    !IS_TEST.test(path)
  );
}

/** Read for archive ids and ADR cites only: the living docs, the reference models
 *  (their comments carry decisions, and name the issues their test shapes came from)
 *  and the capture harness. */
function isIdsOnly(path) {
  if (TOP_FILES.includes(path) && path.endsWith(".md")) return true;
  if (path === "ux-capture/README.md") return true;
  if (path.startsWith("docs/"))
    return path.endsWith(".md") && !DOC_HISTORY.test(path);
  if (IS_TEST.test(path) || !path.endsWith(".ts")) return false;
  return (
    /^src\/engine\/__tests__\/reference\/[^/]+$/.test(path) ||
    (path.startsWith("ux-capture/") && !path.includes("/__tests__/"))
  );
}

/** Whether the check reads `path` (repository-relative, `/`-separated). */
export function inScope(path) {
  return isAppSource(path) || isIdsOnly(path);
}

const lineAt = (text, pos) => text.slice(0, pos).split("\n").length;

/** Every comment in a .ts/.tsx file, with the line it starts on. */
function codeComments(text, path) {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const seen = new Map();
  const collect = (pos) => {
    // A comment on the line of the token before it is a trailing one.
    for (const r of [
      ...(ts.getLeadingCommentRanges(text, pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, pos) ?? []),
    ])
      seen.set(r.pos, text.slice(r.pos, r.end));
  };
  const visit = (node) => {
    // JSX text is page text, and its trivia scan would read `//` in it as a comment.
    if (node.kind === ts.SyntaxKind.JsxText) return;
    collect(node.pos);
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  return [...seen]
    .sort(([a], [b]) => a - b)
    .map(([pos, body]) => ({ line: lineAt(text, pos), body }));
}

/** Every `/* … *\/` comment in a stylesheet, with the line it starts on. */
function cssComments(text) {
  return [...text.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => ({
    line: lineAt(text, m.index),
    body: m[0],
  }));
}

/**
 * One Rust token at a time: a line comment (group 1), the start of a block comment
 * (group 2), a raw, byte or plain string, a char literal, or a run of other code. A
 * lifetime (`'a`) is no char literal, so its quote falls to the last branch.
 */
const RUST_TOKEN =
  /(\/\/[^\n]*)|(\/\*)|b?r(#*)"[\s\S]*?"\3|b?"(?:\\[\s\S]|[^"\\])*"|b?'(?:\\(?:u\{[0-9a-fA-F]+\}|[^\n])|[^'\\\n])'|[^/"'br]+|[\s\S]/gy;

/** The end of the (nested) block comment that opens at `start`. */
function blockCommentEnd(text, start) {
  const delim = /\/\*|\*\//g;
  delim.lastIndex = start + 2;
  let depth = 1;
  for (let m = delim.exec(text); m; m = delim.exec(text)) {
    depth += m[0] === "/*" ? 1 : -1;
    if (depth === 0) return delim.lastIndex;
  }
  return text.length;
}

/** Every comment in a .rs file, with the line it starts on: `//`, `///`, `//!` and
 *  nested `/* … *\/`; strings, raw strings and char literals are code. */
function rustComments(text) {
  const out = [];
  RUST_TOKEN.lastIndex = 0;
  for (let m = RUST_TOKEN.exec(text); m; m = RUST_TOKEN.exec(text)) {
    if (m[1]) out.push({ line: lineAt(text, m.index), body: m[1] });
    if (!m[2]) continue;
    const end = blockCommentEnd(text, m.index);
    out.push({ line: lineAt(text, m.index), body: text.slice(m.index, end) });
    RUST_TOKEN.lastIndex = end;
  }
  return out;
}

/** The text the check reads in a file, each part with its first line: the comments of
 *  code, or the whole of a doc. */
export function commentsOf(text, path) {
  if (path.endsWith(".md")) return [{ line: 1, body: text }];
  if (path.endsWith(".rs")) return rustComments(text);
  return path.endsWith(".css") ? cssComments(text) : codeComments(text, path);
}

/** The refused references in one file's comments. `adrs`: the numbers with a file;
 *  `open`: the issues a comment may cite (app source only). */
export function problemsIn(text, path, adrs, open = CITED_OPEN_ISSUES) {
  const out = [];
  const issues = !isIdsOnly(path);
  for (const { line, body } of commentsOf(text, path)) {
    body.split("\n").forEach((l, i) => {
      for (const m of l.matchAll(ARCHIVE_ID))
        out.push({
          path,
          line: line + i,
          message: `retired archive id ${m[0]}`,
        });
      for (const m of l.matchAll(ADR_CITE))
        if (!adrs.has(m[1]))
          out.push({
            path,
            line: line + i,
            message: `ADR ${m[1]} has no file in docs/adr`,
          });
      if (!issues) return;
      for (const m of l.replace(CODE_SPAN, "").matchAll(ISSUE_REF))
        if (!open.has(Number(m[1])))
          out.push({
            path,
            line: line + i,
            message: `issue #${m[1]} is not on CITED_OPEN_ISSUES`,
          });
    });
  }
  return out;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** The ADR numbers with a file in docs/adr. */
export function adrNumbers(root = ROOT) {
  return new Set(
    readdirSync(join(root, "docs", "adr"))
      .map((f) => /^(\d{4})-.*\.md$/.exec(f)?.[1])
      .filter(Boolean),
  );
}

/** Every in-scope file of the repository (`paths`) and its refused references. */
export function check(root = ROOT) {
  const adrs = adrNumbers(root);
  const paths = [
    ...WALKED.flatMap((d) => walk(join(root, d))),
    ...TOP_FILES.map((f) => join(root, f)),
  ]
    .map((p) => relative(root, p).split(sep).join("/"))
    .filter(inScope);
  const problems = paths.flatMap((f) =>
    problemsIn(readFileSync(join(root, f), "utf8"), f, adrs),
  );
  return { files: paths.length, paths, problems };
}

function main() {
  const { files, problems } = check();
  for (const p of problems) console.error(`${p.path}:${p.line}: ${p.message}`);
  if (problems.length > 0) {
    console.error(
      `\n${problems.length} comment reference(s) refused in ${files} files: cite a decision as ` +
        "`ADR nnnn` (an existing docs/adr file) or an issue on CITED_OPEN_ISSUES, or say the reason in words (#457).",
    );
    process.exit(1);
  }
  console.log(`comment references: ${files} files clean`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main();
}
