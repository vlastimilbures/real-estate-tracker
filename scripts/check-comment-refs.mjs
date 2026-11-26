// Comment references (#457, `pnpm lint`): a comment in the app's source cites a decision
// as `ADR nnnn`, and that ADR has a file in docs/adr. Ids from the retired refactor
// archive (DR-nnn, UX-nnn, J-nn, Q-nn, D-nn, phase ids such as P5b) point at documents
// that are not in the repository, so they are refused, and so is an issue number
// (`#nnn`) unless the issue is on CITED_OPEN_ISSUES: a closed issue's number tells the
// reader nothing the sentence does not. Only comments are read: the TypeScript scanner
// finds them in .ts/.tsx (strings, templates and JSX text are not comments), and
// `/* … */` in .css. Tests are out of scope: their comments name cases, not decisions.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The retired id families, each as a whole word. */
const ARCHIVE_ID = /\b(?:(?:DR|UX|J|Q|D)-\d+[a-z]?|P\d+[a-z]?)\b/g;
const ADR_CITE = /\bADR (\d{4})\b/g;
/** `#nnn`, not an HTML entity (`&#123;`) or a digit-only hex colour (`#202427`). */
const ISSUE_REF = /(?<![\w&#])#(\d{2,4})\b/g;

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

/** App source under src: .ts, .tsx and .css, without tests and test support. */
export function inScope(path) {
  const parts = path.split(/[\\/]/);
  return (
    parts[0] === "src" &&
    !parts.includes("__tests__") &&
    /\.(ts|tsx|css)$/.test(path) &&
    !/\.test\.tsx?$/.test(path)
  );
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

/** The comments of a source file, each with its first line. */
export function commentsOf(text, path) {
  return path.endsWith(".css") ? cssComments(text) : codeComments(text, path);
}

/** The refused references in one file's comments. `adrs`: the numbers with a file;
 *  `open`: the issues a comment may cite. */
export function problemsIn(text, path, adrs, open = CITED_OPEN_ISSUES) {
  const out = [];
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
      for (const m of l.matchAll(ISSUE_REF))
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

/** Every in-scope file under src and its refused references. */
export function check(root = ROOT) {
  const adrs = adrNumbers(root);
  const files = walk(join(root, "src"))
    .map((p) => relative(root, p).split(sep).join("/"))
    .filter(inScope);
  const problems = files.flatMap((f) =>
    problemsIn(readFileSync(join(root, f), "utf8"), f, adrs),
  );
  return { files: files.length, problems };
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
