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
// file per entry makes a second caller wait for the first one's run. Only the path goes to
// stdout; progress goes to stderr. Node built-ins only.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
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
  validMarker,
  type CacheItem,
} from "./baselineCache.ts";

const log = (msg: string) => console.error(`ux:baseline: ${msg}`);
const SHA_RE = /^[0-9a-f]{40}$/;

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

/**
 * Whether a lock folder is stale. A lock without a readable pid counts as live for
 * LOCK_GRACE_MS (its taker may not have written the pid yet); a lock that vanished
 * while being read is reported as stale so the caller simply retries.
 */
function isStaleLock(lock: string): boolean {
  let age: number;
  try {
    age = Date.now() - statSync(lock).mtimeMs;
  } catch {
    return true;
  }
  let pid: number | null = null;
  try {
    const n = Number(readFileSync(join(lock, "pid"), "utf8").trim());
    if (Number.isInteger(n) && n > 0) pid = n;
  } catch {
    // no pid yet, or the lock is going away
  }
  return lockStale(pid, pid !== null && alive(pid), age);
}

/**
 * Takes the entry's lock (an atomic mkdir, then the pid inside), or returns false while
 * a live process holds it. A stale lock is removed and the take retried.
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
    log(`removing the stale lock ${lock}`);
    rmSync(lock, { recursive: true, force: true });
  }
  return false;
}

function run(cmd: string, args: string[], cwd: string, env = process.env) {
  // The capture's own output goes to stderr: stdout carries only the path.
  const r = spawnSync(cmd, args, { cwd, env, stdio: ["ignore", 2, 2] });
  return r.status === 0;
}

async function build(sha: string, dest: string, env: NodeJS.ProcessEnv) {
  const tree = mkdtempSync(join(tmpdir(), `rtracker-ux-${sha.slice(0, 8)}-`));
  const out = `${dest}.tmp-${process.pid}`;
  rmSync(out, { recursive: true, force: true });
  const started = Date.now();
  try {
    log(`checking out ${sha} in ${tree}`);
    git("worktree", "add", "--detach", "--force", tree, sha);
    const installEnv = { ...process.env, HUSKY: "0" };
    const install = ["install", "--frozen-lockfile"];
    if (!run("pnpm", [...install, "--offline"], tree, installEnv)) {
      log("offline install failed; installing online");
      if (!run("pnpm", install, tree, installEnv))
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
    if (!run("pnpm", ["ux:capture", ...workers], tree, capEnv))
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
    rmSync(out, { recursive: true, force: true });
    try {
      git("worktree", "remove", "--force", tree);
    } catch {
      rmSync(tree, { recursive: true, force: true });
      git("worktree", "prune");
    }
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
  let waited = false;
  for (;;) {
    if (validMarker(readMarker(dest), sha, key)) break;
    if (tryLock(lock)) {
      try {
        // Another caller may have finished between the check and the lock.
        if (!validMarker(readMarker(dest), sha, key))
          await build(sha, dest, process.env);
      } finally {
        rmSync(lock, { recursive: true, force: true });
      }
      break;
    }
    if (!waited) log(`another process is capturing ${sha}; waiting`);
    waited = true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(dest);
}

function prune() {
  const root = cacheRoot(process.env, homedir());
  if (!existsSync(root)) return;
  // What to delete is decided by planPrune (pure); here only the disk is read.
  const tree: Record<string, CacheItem[]> = {};
  for (const sha of readdirSync(root)) {
    const shaDir = join(root, sha);
    if (!SHA_RE.test(sha) || !statSync(shaDir).isDirectory()) continue;
    tree[sha] = readdirSync(shaDir).map((name) => {
      const path = join(shaDir, name);
      const st = statSync(path);
      return {
        name,
        isDir: st.isDirectory(),
        marker: readMarker(path) as { date?: string } | null,
        mtime: st.mtime,
        staleLock: name.endsWith(".lock") && isStaleLock(path),
      };
    });
  }
  const doomed = planPrune({
    tree,
    reachable: (sha) =>
      spawnSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"])
        .status === 0,
    mainSha: git("rev-parse", "--verify", "origin/main^{commit}"),
    now: new Date(),
  });
  for (const rel of doomed) {
    log(`pruning ${join(root, rel)}`);
    rmSync(join(root, rel), { recursive: true, force: true });
  }
  for (const sha of Object.keys(tree)) {
    const shaDir = join(root, sha);
    if (readdirSync(shaDir).length === 0) rmSync(shaDir, { recursive: true });
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
