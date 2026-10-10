#!/usr/bin/env bash
# Decides whether a CI run needs the full checks or only the docs checks.
# Prints `code=true` or `code=false` to $GITHUB_OUTPUT (stdout when unset).
#
# `code=false` (docs fast path) only when one of these holds:
#   1. every file the pull request changes is documentation, or
#   2. on a pull request push, every file changed since the previous push is documentation
#      AND the previous head already passed the three required checks, so the full result
#      still holds (an ADR renumber or a CHANGELOG fix after review).
# Anything else, including any error here, means `code=true`: CI never skips by accident.
#
# Env: EVENT, REPO, PR (number), BEFORE (previous head; empty on open), HEAD_SHA, GH_TOKEN.
set -uo pipefail

out() {
  echo "code=$1" >>"${GITHUB_OUTPUT:-/dev/stdout}"
  echo "code=$1 ($2)"
  exit 0
}

# Documentation: no file here can change a test, the build or the app.
is_docs() {
  case "$1" in
    docs/* | .claude/* | *.md) return 0 ;;
    *) return 1 ;;
  esac
}

all_docs() {
  local f any=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    any=1
    is_docs "$f" || return 1
  done
  [[ $any == 1 ]]
}

REQUIRED=(
  "Frontend (typecheck · lint · format · test)"
  "Rust (fmt · clippy · test · audit · build)"
  "Accessibility (axe scan)"
)

[[ "${EVENT:-}" == pull_request ]] || out true "not a pull request"

files=$(gh api --paginate "repos/$REPO/pulls/$PR/files" --jq '.[].filename') ||
  out true "could not list the pull request's files"
all_docs <<<"$files" && out false "the pull request changes only documentation"

[[ -n "${BEFORE:-}" && "$BEFORE" != 0000000000000000000000000000000000000000 ]] ||
  out true "no previous push to compare with"

# `ahead` = the new head only adds commits on top of the old one (no rebase, no force push).
compare=$(gh api "repos/$REPO/compare/$BEFORE...$HEAD_SHA" \
  --jq '.status, (.files | length), .files[].filename') ||
  out true "could not compare with the previous push"
status=$(sed -n 1p <<<"$compare")
count=$(sed -n 2p <<<"$compare")
[[ "$status" == ahead ]] || out true "previous push is not an ancestor ($status)"
# The compare API lists at most 300 files.
((count > 0 && count < 300)) || out true "$count files since the previous push"
tail -n +3 <<<"$compare" | all_docs || out true "code changed since the previous push"

conclusion_of() {
  gh api "repos/$REPO/commits/$BEFORE/check-runs" -X GET -f check_name="$1" \
    --jq '[.check_runs[] | select(.app.slug == "github-actions")][0].conclusion // "missing"'
}

# A previous push that took this fast path itself shows the three checks as skipped and
# "Docs" as green; it stood on a green push in turn, so it counts as green.
docs=$(conclusion_of "Docs (format · ADR index)") ||
  out true "could not read the previous push's checks"
for check in "${REQUIRED[@]}"; do
  conclusion=$(conclusion_of "$check") || out true "could not read the previous push's checks"
  [[ "$conclusion" == success || ("$conclusion" == skipped && "$docs" == success) ]] ||
    out true "'$check' was '$conclusion' on the previous push"
done
out false "only documentation changed since a fully green push"
