// Shared capture baseline of a commit (default origin/main), so a PR's proof captures only
// its own branch. Prints the folder of a complete run of that commit for the UX_LANG /
// UX_THEME / UX_VIEWPORT matrix, capturing it first when the cache has none:
//
//   pnpm -s ux:baseline [ref]     # → <cache>/<sha>/<matrix key>
//   pnpm ux:diff "$(pnpm -s ux:baseline)" <run>
//   pnpm ux:baseline --prune      # drop entries main no longer reaches or older than 14 days
//
// The cache is `$UX_BASELINE_CACHE`, else ~/Library/Caches/rtracker-ux. A miss checks the
// commit out into a temporary detached worktree, installs it (offline first, never a
// symlinked node_modules: that changes font resolution), captures it there with UX_AXE=0
// on a free port, and moves the run into place with complete.json written last. A lock
// folder per entry makes a second caller wait for the first one's run; Ctrl-C or SIGTERM
// removes the lock, the unfinished run and the worktree. Only the path goes to stdout;
// progress goes to stderr. Node built-ins only.
import {
  execFileSync,
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  MARKER,
  cachePath,
  cacheRoot,
  lockStale,
  makeMarker,
  matrixFor,
  planPrune,
  readCacheTree,
  validMarker,
} from "./baselineCache.ts";

const log = (msg: string) => console.error(`ux:baseline: ${msg}`);

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readMarker(dir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, MARKER), "utf8"));
  } catch {
    return null;
  }
}

/** PNGs across a run's variant folders. */
function countScreens(dir: string): number {
  let n = 0;
  for (const v of readdirSync(dir, { withFileTypes: true }))
    if (v.isDirectory() && !v.name.startsWith("."))
      n += readdirSync(join(dir, v.name)).filter((f) =>
        f.endsWith(".png"),
      ).length;
  return n;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() =>
        typeof addr === "object" && addr
          ? resolve(addr.port)
          : reject(new Error("no free port")),
      );
    });
  });
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The pid inside a lock folder, or null when there is none (yet) or it is unreadable. */
function lockPid(lock: string): number | null {
  try {
    const n = Number(readFileSync(join(lock, "pid"), "utf8").trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Whether a lock folder is stale (`lockStale`). A lock that vanished while being read is
 * reported as stale, so the caller simply retries.
 */
function isStaleLock(lock: string): boolean {
  let age: number;
  try {
    age = Date.now() - lstatSync(lock).mtimeMs;
  } catch {
    return true;
  }
  const pid = lockPid(lock);
  return lockStale(pid, pid !== null && alive(pid), age);
}

/**
 * Breaks a lock judged stale: renames it aside to `<lock>.stale-<pid>` (atomic: of two
 * breakers only one wins, the other gets an error and retries) and deletes only what it
 * renamed. If what it renamed carries another pid than the one judged stale, a new taker
 * got in between: it is put back untouched.
 */
function breakStaleLock(lock: string): boolean {
  const judged = lockPid(lock);
  const aside = `${lock}.stale-${process.pid}`;
  try {
    renameSync(lock, aside);
  } catch {
    return false; // someone else broke or took it first
  }
  if (lockPid(aside) !== judged) {
    try {
      renameSync(aside, lock);
    } catch {
      log(`could not put back the live lock ${lock}; left as ${aside}`);
    }
    return false;
  }
  rmSync(aside, { recursive: true, force: true });
  return true;
}

/**
 * Takes the entry's lock (an atomic mkdir, then the pid inside), or returns false while
 * a live process holds it. A stale lock is broken and the take retried.
 */
function tryLock(lock: string): boolean {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "pid"), String(process.pid));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    if (!isStaleLock(lock)) return false;
    if (breakStaleLock(lock)) log(`broke the stale lock ${lock}`);
  }
  return false;
}

// On Ctrl-C or SIGTERM: stop the capture, undo what this run created, then die of the
// same signal. The steps are registered while their resource exists.
const onAbort = new Set<() => void>();
let child: ChildProcess | null = null;
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    child?.kill(sig);
    for (const undo of [...onAbort].reverse()) {
      try {
        undo();
      } catch {
        // best effort: keep undoing the rest
      }
    }
    process.removeAllListeners(sig);
    process.kill(process.pid, sig);
  });

/** Runs a command (async, so a signal can stop it); its output goes to stderr. */
function run(cmd: string, args: string[], cwd: string, env = process.env) {
  return new Promise<boolean>((resolve) => {
    // The capture's own output goes to stderr: stdout carries only the path.
    child = spawn(cmd, args, { cwd, env, stdio: ["ignore", 2, 2] });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => {
      child = null;
      resolve(code === 0);
    });
  });
}

function removeWorktree(tree: string) {
  try {
    git("worktree", "remove", "--force", tree);
  } catch {
    rmSync(tree, { recursive: true, force: true });
    git("worktree", "prune");
  }
}

async function build(sha: string, dest: string, env: NodeJS.ProcessEnv) {
  const tree = mkdtempSync(join(tmpdir(), `rtracker-ux-${sha.slice(0, 8)}-`));
  const out = `${dest}.tmp-${process.pid}`;
  const undoOut = () => rmSync(out, { recursive: true, force: true });
  const undoTree = () => removeWorktree(tree);
  onAbort.add(undoTree);
  onAbort.add(undoOut);
  undoOut();
  const started = Date.now();
  try {
    log(`checking out ${sha} in ${tree}`);
    git("worktree", "add", "--detach", "--force", tree, sha);
    const installEnv = { ...process.env, HUSKY: "0" };
    const install = ["install", "--frozen-lockfile"];
    if (!(await run("pnpm", [...install, "--offline"], tree, installEnv))) {
      log("offline install failed; installing online");
      if (!(await run("pnpm", install, tree, installEnv)))
        throw new Error("pnpm install failed");
    }
    const port = await freePort();
    log(`capturing on port ${port} into ${out}`);
    const capEnv: NodeJS.ProcessEnv = {
      ...env,
      UX_OUT: out,
      UX_PORT: String(port),
      UX_AXE: "0",
      UX_RETRIES: env.UX_RETRIES ?? "1",
    };
    delete capEnv.UX_RUN_ID;
    // UX_WORKERS caps Playwright's workers (a flag, so older commits take it too).
    const workers = env.UX_WORKERS ? [`--workers=${env.UX_WORKERS}`] : [];
    if (!(await run("pnpm", ["ux:capture", ...workers], tree, capEnv)))
      throw new Error(`the capture of ${sha} failed; see the output above`);
    const screens = countScreens(out);
    if (screens === 0) throw new Error("the capture wrote no screenshots");
    writeFileSync(
      join(out, MARKER),
      JSON.stringify(makeMarker(sha, env, screens, new Date()), null, 2) + "\n",
    );
    rmSync(dest, { recursive: true, force: true });
    renameSync(out, dest);
    log(`${screens} screens in ${Math.round((Date.now() - started) / 1000)} s`);
  } finally {
    undoOut();
    undoTree();
    onAbort.delete(undoOut);
    onAbort.delete(undoTree);
  }
}

async function baseline(ref: string) {
  for (const v of ["UX_SPEC", "UX_SCALE", "UX_DATE"])
    if (process.env[v] !== undefined)
      throw new Error(
        `${v} is set: the baseline cache holds default captures only`,
      );
  const sha = git("rev-parse", "--verify", `${ref}^{commit}`);
  const { key } = matrixFor(process.env);
  const dest = cachePath(cacheRoot(process.env, homedir()), sha, key);
  mkdirSync(join(dest, ".."), { recursive: true });
  const lock = `${dest}.lock`;
  const undoLock = () => rmSync(lock, { recursive: true, force: true });
  let waited = false;
  for (;;) {
    if (validMarker(readMarker(dest), sha, key)) break;
    if (tryLock(lock)) {
      onAbort.add(undoLock);
      try {
        // Another caller may have finished between the check and the lock.
        if (!validMarker(readMarker(dest), sha, key))
          await build(sha, dest, process.env);
      } finally {
        undoLock();
        onAbort.delete(undoLock);
      }
      break;
    }
    if (!waited) log(`another process is capturing ${sha}; waiting`);
    waited = true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(dest);
}

/** Whether origin/main reaches `sha`: exit 0 yes, 1 no; anything else is unknown (keep). */
function reachable(sha: string): boolean | null {
  const r = spawnSync("git", [
    "merge-base",
    "--is-ancestor",
    sha,
    "origin/main",
  ]);
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  log(`git cannot tell whether origin/main reaches ${sha}; keeping it`);
  return null;
}

function prune() {
  const root = cacheRoot(process.env, homedir());
  if (!existsSync(root)) return;
  // What to delete is decided by planPrune (pure); here only the disk is read.
  const tree = readCacheTree(root, {
    readdir: (dir) => readdirSync(dir),
    lstat: (path) => lstatSync(path),
    readMarker,
    staleLock: isStaleLock,
  });
  const doomed = planPrune({
    tree,
    reachable,
    mainSha: git("rev-parse", "--verify", "origin/main^{commit}"),
    now: new Date(),
  });
  for (const rel of doomed) {
    const path = join(root, rel);
    if (rel.endsWith(".lock")) {
      // A taker may have broken and replaced it since the listing: check again.
      if (isStaleLock(path) && breakStaleLock(path)) log(`pruned ${path}`);
      continue;
    }
    log(`pruning ${path}`);
    rmSync(path, { recursive: true, force: true });
  }
  for (const sha of Object.keys(tree)) {
    const shaDir = join(root, sha);
    try {
      if (readdirSync(shaDir).length === 0) rmSync(shaDir, { recursive: true });
    } catch {
      // vanished meanwhile
    }
  }
}

const args = process.argv.slice(2);
try {
  if (args[0] === "--prune") prune();
  else if (args.length <= 1 && !args[0]?.startsWith("-"))
    await baseline(args[0] ?? "origin/main");
  else {
    console.error(
      "usage: pnpm -s ux:baseline [ref] | pnpm ux:baseline --prune",
    );
    process.exit(2);
  }
} catch (e) {
  log((e as Error).message);
  process.exit(1);
}
