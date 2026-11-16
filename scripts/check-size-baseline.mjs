// Function size baseline (#456): today's functions over the length or complexity limits
// (scripts/size-limits.mjs) are listed in function-size-baseline.json with ESLint's own
// numbers. eslint-suppressions.json keeps `eslint .` green for them, but it counts per file
// and rule only, so this check is what stops a listed function from growing. The
// suppressions file must hold exactly the counts the baseline implies, for the two size
// rules only: it can never silence another rule.
//
//   node scripts/check-size-baseline.mjs           fail on a new offender, growth or shrinkage
//   node scripts/check-size-baseline.mjs --update  lower/remove entries that shrank (never adds)
//                                                  and rewrite the suppressions from them
//   node scripts/check-size-baseline.mjs --init    write both files from scratch (once)
//   node scripts/check-size-baseline.mjs --base [ref]  fail if the baseline gained an entry
//                                                  or a number against ref (default origin/main)
//
// Keys: a named function is keyed by ESLint's label ("Function 'Import'"). An unnamed one
// by the nearest enclosing named function and what it is bound to: "Arrow function
// (useUiStore: create)" for a top-level `const useUiStore = create(() => …)`, "Arrow
// function (Import > useEffect)" for a `useEffect(() => …)` inside `Import`. Never a line.
// Functions that still share a key in a file form a bag, stored as a list of values from
// the largest down and compared as a bag: no more entries than the baseline, and pairwise
// no higher values once both are sorted.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import * as prettier from "prettier";
import tseslint from "typescript-eslint";
import { SIZE_RULES } from "./size-limits.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASELINE = "function-size-baseline.json";
const SUPPRESSIONS = "eslint-suppressions.json";
const METRIC = { "max-lines-per-function": "lines", complexity: "complexity" };
const VALUE =
  /^(.*) (?:has too many lines \((\d+)\)|has a complexity of (\d+))\./;
// ESLint's line terminators (its column numbers count from the last of these).
const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/g;
const FUNCTIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);
const MEMBERS = new Set(["Property", "PropertyDefinition", "MethodDefinition"]);
// Wrappers between an unnamed function and the name it is bound to.
const PASS_THROUGH = new Set([
  "CallExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "ChainExpression",
  "AwaitExpression",
  "JSXExpressionContainer",
  "ArrayExpression",
]);

/** An ESLint instance that runs the two size rules only (no suppressions applied). */
export function createLinter(root = ROOT) {
  return new ESLint({
    cwd: root,
    ruleFilter: ({ ruleId }) => SIZE_RULES.includes(ruleId),
  });
}

/** Every function node of `source`, each with its parent chain (nearest first). */
function functionNodes(source, filePath) {
  const { ast, visitorKeys } = tseslint.parser.parseForESLint(source, {
    jsx: filePath.endsWith(".tsx"),
    range: true,
    loc: true,
    filePath,
  });
  const found = [];
  const walk = (node, parents) => {
    if (FUNCTIONS.has(node.type)) found.push({ node, parents });
    const next = [node, ...parents];
    for (const key of visitorKeys[node.type] ?? []) {
      for (const child of [node[key]].flat()) {
        if (child && typeof child.type === "string") walk(child, next);
      }
    }
  };
  walk(ast, []);
  return found;
}

const text = (node, source) => source.slice(...node.range);
const calleeName = (callee, source) => {
  let c = callee;
  while (c.type === "CallExpression") c = c.callee;
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression" && !c.computed) return c.property.name;
  return text(c, source);
};
const nameOf = (node, source) =>
  node.type === "Identifier" || node.type === "JSXIdentifier"
    ? node.name
    : text(node, source);
const keyName = (member, source) =>
  member.computed
    ? `[${text(member.key, source)}]`
    : nameOf(member.key, source);

/** "useUiStore: create" for `const useUiStore = create(() => …)`, or null. */
function bindingOf(node, parents, source) {
  const calls = [];
  let child = node;
  for (const parent of parents) {
    if (parent.type === "CallExpression" && parent.callee !== child) {
      calls.unshift(calleeName(parent.callee, source));
    } else if (!PASS_THROUGH.has(parent.type)) {
      let name = null;
      if (parent.type === "VariableDeclarator")
        name = nameOf(parent.id, source);
      else if (MEMBERS.has(parent.type)) name = keyName(parent, source);
      else if (parent.type === "AssignmentExpression")
        name = nameOf(parent.left, source);
      else if (parent.type === "JSXAttribute")
        name = nameOf(parent.name, source);
      return [name, calls.join(" → ")].filter(Boolean).join(": ") || null;
    }
    child = parent;
  }
  return calls.join(" → ") || null;
}

/** A function's own name: its id, the variable it initialises, or its member key. */
function ownName(node, parent, source) {
  if (node.id) return node.id.name;
  if (parent?.type === "VariableDeclarator" && parent.init === node)
    return nameOf(parent.id, source);
  if (MEMBERS.has(parent?.type) && parent.value === node)
    return keyName(parent, source);
  return null;
}

/** The nearest enclosing function that has a name, or null. */
function enclosingName(parents, source) {
  for (let i = 0; i < parents.length; i++) {
    if (FUNCTIONS.has(parents[i].type)) {
      const name = ownName(parents[i], parents[i + 1], source);
      if (name) return name;
    }
  }
  return null;
}

/** Where ESLint may report a function: from its start (or its member's key, for a method
 * or a computed key) up to its body. */
const headStart = ({ node, parents }) =>
  MEMBERS.has(parents[0]?.type) && parents[0].value === node
    ? parents[0].range[0]
    : node.range[0];

function functionAt(fns, offset) {
  const hits = fns.filter(
    (fn) => headStart(fn) <= offset && offset <= fn.node.body.range[0],
  );
  return hits.sort((a, b) => headStart(b) - headStart(a))[0];
}

function lineStarts(source) {
  const starts = [0];
  for (const m of source.matchAll(LINE_BREAK))
    starts.push(m.index + m[0].length);
  return starts;
}

/** The key of the unnamed function ESLint reported at `line:column`. */
function unnamedKey(label, ctx, m, file) {
  ctx.fns ??= functionNodes(ctx.source, ctx.filePath);
  ctx.starts ??= lineStarts(ctx.source);
  const offset = ctx.starts[m.line - 1] + m.column - 1;
  const hit = functionAt(ctx.fns, offset);
  if (!hit)
    throw new Error(`${file}:${m.line}: no function at ${m.ruleId} message`);
  const where = [
    enclosingName(hit.parents, ctx.source),
    bindingOf(hit.node, hit.parents, ctx.source),
  ].filter(Boolean);
  return where.length > 0 ? `${label} (${where.join(" > ")})` : label;
}

const bag = (v) => (Array.isArray(v) ? v : [v]);
/** Values from the largest down; a single one is stored as a plain number. */
const store = (values) => {
  const sorted = [...values].sort((a, b) => b - a);
  return sorted.length === 1 ? sorted[0] : sorted;
};

/** `{ file: { lines: { key: n | [n, …] }, complexity: { … } } }` from ESLint results.
 * Every message counts: two functions never collapse into one entry. */
export function measure(results, root = ROOT) {
  const raw = {};
  for (const result of results) {
    const file = relative(root, result.filePath).split("\\").join("/");
    const size = result.messages.filter((m) => METRIC[m.ruleId]);
    if (size.length === 0) continue;
    const ctx = {
      filePath: result.filePath,
      source: result.source ?? readFileSync(result.filePath, "utf8"),
    };
    for (const m of size) {
      const match = VALUE.exec(m.message);
      if (!match) {
        throw new Error(
          `${file}:${m.line}: unexpected ${m.ruleId} message "${m.message}"`,
        );
      }
      const label = match[1];
      const key = label.includes("'") ? label : unnamedKey(label, ctx, m, file);
      const metric = METRIC[m.ruleId];
      ((raw[file] ??= {})[metric] ??= {})[key] ??= [];
      raw[file][metric][key].push(Number(match[2] ?? match[3]));
    }
  }
  return sortDeep(mapValues(raw, store));
}

const mapValues = (map, f) =>
  Object.fromEntries(
    Object.entries(map).map(([file, metrics]) => [
      file,
      Object.fromEntries(
        Object.entries(metrics).map(([metric, fns]) => [
          metric,
          Object.fromEntries(Object.entries(fns).map(([fn, v]) => [fn, f(v)])),
        ]),
      ),
    ]),
  );
/** A stored value as a list from the largest down. */
const sorted = (v) => bag(store(bag(v)));
const entries = (map) =>
  Object.entries(map).flatMap(([file, metrics]) =>
    Object.entries(metrics).flatMap(([metric, fns]) =>
      Object.entries(fns).map(([fn, v]) => ({
        file,
        metric,
        fn,
        values: sorted(v),
      })),
    ),
  );
const lookup = (map, { file, metric, fn }) => {
  const v = map[file]?.[metric]?.[fn];
  return v === undefined ? undefined : sorted(v);
};

/** How bag `now` stands against bag `was` (both from the largest down). */
function bagStatus(now, was) {
  if (now.length > was.length) return "more";
  if (now.some((v, i) => v > was[i])) return "grew";
  if (now.length < was.length || now.some((v, i) => v < was[i]))
    return "shrunk";
  return "same";
}

/** Every difference between measured and baseline: new, more, grew, shrunk or gone. */
export function compare(measured, baseline) {
  const problems = [];
  for (const e of entries(measured)) {
    const base = lookup(baseline, e);
    if (base === undefined) {
      problems.push({ ...e, kind: "new" });
      continue;
    }
    const kind = bagStatus(e.values, base);
    if (kind !== "same") problems.push({ ...e, base, kind });
  }
  for (const e of entries(baseline)) {
    if (lookup(measured, e) === undefined)
      problems.push({ ...e, base: e.values, values: [], kind: "gone" });
  }
  return problems;
}

/** The baseline tightened to what was measured: a bag keeps at most as many entries as
 * both have, each the lower of the two (sorted pairwise); gone keys are removed. Never
 * adds an entry or raises a value. */
export function tighten(baseline, measured) {
  const out = {};
  for (const e of entries(baseline)) {
    const now = lookup(measured, e);
    if (now === undefined) continue;
    const n = Math.min(now.length, e.values.length);
    const values = e.values.slice(0, n).map((v, i) => Math.min(v, now[i]));
    ((out[e.file] ??= {})[e.metric] ??= {})[e.fn] = store(values);
  }
  return sortDeep(out);
}

/** Entries added or numbers raised in `current` against the base branch's baseline.
 * A file move is accepted when the old file is gone from the working tree, the new file
 * did not exist on the base ref, and the moved bag is no bigger and no higher. */
export function baseDiff(current, base, files = {}) {
  const { existsNow = () => true, existedAtBase = () => true } = files;
  const removed = entries(base).filter(
    (e) => lookup(current, e) === undefined && !existsNow(e.file),
  );
  return entries(current).flatMap((e) => {
    const before = lookup(base, e);
    if (before !== undefined) {
      const kind = bagStatus(e.values, before);
      if (kind === "more") return [{ ...e, base: before, kind: "added" }];
      if (kind === "grew") return [{ ...e, base: before, kind: "raised" }];
      return [];
    }
    const moved = existedAtBase(e.file)
      ? -1
      : removed.findIndex(
          (r) =>
            r.fn === e.fn &&
            r.metric === e.metric &&
            ["same", "shrunk"].includes(bagStatus(e.values, r.values)),
        );
    if (moved === -1) return [{ ...e, kind: "added" }];
    removed.splice(moved, 1);
    return [];
  });
}

/** The suppressions file the baseline implies: the two size rules only, one count per
 * baselined function. */
export function suppressionsFor(baseline) {
  const out = {};
  for (const [file, metrics] of Object.entries(baseline)) {
    for (const rule of SIZE_RULES) {
      const count = Object.values(metrics[METRIC[rule]] ?? {}).reduce(
        (n, v) => n + bag(v).length,
        0,
      );
      if (count > 0) (out[file] ??= {})[rule] = { count };
    }
  }
  return sortDeep(out);
}

/** Every file and rule where `suppressions` differs from what the baseline implies. */
export function suppressionProblems(suppressions, baseline) {
  const expected = suppressionsFor(baseline);
  const files = new Set([
    ...Object.keys(suppressions),
    ...Object.keys(expected),
  ]);
  return [...files].sort().flatMap((file) => {
    const rules = new Set([
      ...Object.keys(suppressions[file] ?? {}),
      ...Object.keys(expected[file] ?? {}),
    ]);
    return [...rules].sort().flatMap((rule) => {
      const actual = suppressions[file]?.[rule];
      const want = expected[file]?.[rule];
      return JSON.stringify(actual) === JSON.stringify(want)
        ? []
        : [{ file, rule, actual: actual?.count, expected: want?.count ?? 0 }];
    });
  });
}

function sortDeep(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortDeep(value[k])]),
  );
}

const readJson = (file) =>
  existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
/** `value` as the repo's Prettier formats JSON, so the files `--init` / `--update` write
 * pass `prettier --check`. Indented first, so objects stay expanded (Prettier keeps an
 * object's first line break) while a bag fits on one line. */
export async function serialize(value, file) {
  const options = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(JSON.stringify(value, null, 2), {
    ...options,
    filepath: file,
    parser: "json",
  });
}
const writeJson = async (file, value) =>
  writeFileSync(file, await serialize(value, file));
/** Functions over a limit: per file and key, the larger of its two bags. */
const count = (map) => {
  const per = new Map();
  for (const e of entries(map)) {
    const k = `${e.file}\0${e.fn}`;
    per.set(k, Math.max(per.get(k) ?? 0, e.values.length));
  }
  const n = [...per.values()].reduce((a, b) => a + b, 0);
  return `${n} functions in ${Object.keys(map).length} files`;
};

const show = (values) =>
  values.length === 1 ? String(values[0]) : `[${values.join(", ")}]`;
function describe(p) {
  const where = `${p.file}: ${p.fn} ${p.metric}`;
  const update = "run `pnpm lint:size --update`";
  switch (p.kind) {
    case "new":
      return `${where} ${show(p.values)} is over the limit: split it (never add it to ${BASELINE})`;
    case "more":
      return `${where} ${show(p.values)}: more functions over the limit than baselined (${show(p.base)}): split the new one`;
    case "grew":
      return `${where} grew ${show(p.base)} → ${show(p.values)}: keep it at or below the baseline`;
    case "shrunk":
      return `${where} shrunk ${show(p.base)} → ${show(p.values)}: ${update}`;
    default:
      return `${where} is gone or under the limit (was ${show(p.base)}): ${update}`;
  }
}

/** Prints suppression mismatches; true when there are none. */
function suppressionsOk(baseline) {
  const problems = suppressionProblems(readJson(SUPPRESSIONS), baseline);
  if (problems.length === 0) return true;
  console.error(
    `${SUPPRESSIONS} must hold exactly the size-rule counts ${BASELINE} implies ` +
      `(no other rule). Fix the code, then run \`pnpm lint:size --update\`:`,
  );
  for (const p of problems) {
    console.error(
      `  ${p.file}: ${p.rule} ${p.actual ?? "none"}, expected ${p.expected}`,
    );
  }
  return false;
}

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const gitOk = (...args) => {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
};

function checkBase(ref) {
  if (!gitOk("rev-parse", "--verify", "--quiet", `${ref}^{commit}`)) {
    console.error(`Cannot resolve ${ref}: fetch the base branch first.`);
    return 2;
  }
  const current = readJson(BASELINE);
  // The suppressions derive from the baseline, so the baseline diff covers them too.
  const suppressionsMatch = suppressionsOk(current);
  if (!gitOk("cat-file", "-e", `${ref}:${BASELINE}`)) {
    // The pull request that introduces the baseline (#456) has nothing to compare against.
    console.log(`${BASELINE}: not on ${ref} yet, nothing to compare.`);
    return suppressionsMatch ? 0 : 1;
  }
  const diff = baseDiff(
    current,
    JSON.parse(git("show", `${ref}:${BASELINE}`)),
    {
      // Tracked and spelled exactly so (existsSync is case-insensitive on macOS).
      existsNow: (file) => gitOk("ls-files", "--error-unmatch", "--", file),
      existedAtBase: (file) => gitOk("cat-file", "-e", `${ref}:${file}`),
    },
  );
  if (diff.length === 0) {
    console.log(`${BASELINE}: no new or raised entries against ${ref}.`);
    return suppressionsMatch ? 0 : 1;
  }
  console.error(`${BASELINE} grew against ${ref}. Split these instead:`);
  for (const d of diff) {
    const was = d.base ? ` (was ${show(d.base)})` : "";
    console.error(`  + ${d.file}: ${d.fn} ${d.metric} ${show(d.values)}${was}`);
  }
  return 1;
}

async function main(args) {
  process.chdir(ROOT);
  if (args[0] === "--base") {
    const envBase = process.env.GITHUB_BASE_REF;
    return checkBase(
      args[1] ?? (envBase ? `origin/${envBase}` : "origin/main"),
    );
  }
  const measured = measure(await createLinter().lintFiles(["src"]));
  if (args[0] === "--init") {
    await writeJson(BASELINE, measured);
    await writeJson(SUPPRESSIONS, suppressionsFor(measured));
    console.log(`Wrote ${BASELINE} and ${SUPPRESSIONS}: ${count(measured)}.`);
    return 0;
  }
  let baseline = readJson(BASELINE);
  if (args[0] === "--update") {
    baseline = tighten(baseline, measured);
    await writeJson(BASELINE, baseline);
    await writeJson(SUPPRESSIONS, suppressionsFor(baseline));
    console.log(`Updated ${BASELINE} and ${SUPPRESSIONS}: ${count(baseline)}.`);
  }
  const problems = compare(measured, baseline);
  const suppressionsMatch = suppressionsOk(baseline);
  if (problems.length === 0 && suppressionsMatch) {
    console.log(`${BASELINE}: matches; ${count(measured)} over the limits.`);
    return 0;
  }
  if (problems.length > 0) {
    console.error(
      `Function size check failed (CONTRIBUTING.md "Function size and complexity"):`,
    );
    for (const p of problems) console.error(`  ${describe(p)}`);
  }
  return 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  process.exitCode = await main(process.argv.slice(2));
}
