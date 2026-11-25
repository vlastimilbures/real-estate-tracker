// The environment for git in a script test's throw-away repository (#589). Git sets GIT_DIR
// (and GIT_WORK_TREE) inside `git rebase --exec` and GIT_DIR / GIT_INDEX_FILE inside some
// hooks; a test that inherits them runs its `git init` / `commit` / `checkout -b` on the
// caller's repository instead of its temp folder. On 2026-11-25 that set `core.bare=true`
// and created a branch `pr` in the real repository.

// The variables that point git at a repository: `git rev-parse --local-env-vars`, the list
// git itself clears before it enters a submodule. GIT_CONFIG_COUNT comes with
// GIT_CONFIG_KEY_<n> / GIT_CONFIG_VALUE_<n>.
const REPO_VARS = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
]);
const isRepoVar = (name) =>
  REPO_VARS.has(name) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name);

/** `env` (default process.env) without the variables that point git at a repository, with
 * a fixed author and committer, so git finds the repository from its cwd alone. */
export function cleanGitEnv(env = process.env) {
  const clean = Object.fromEntries(
    Object.entries(env).filter(([name]) => !isRepoVar(name)),
  );
  return {
    ...clean,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
}
