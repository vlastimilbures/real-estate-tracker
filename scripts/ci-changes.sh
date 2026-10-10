#!/usr/bin/env bash
# Decides whether a CI run needs the full checks or only the docs checks.
# Prints `code=true` or `code=false` to $GITHUB_OUTPUT (stdout when unset).
#
# `code=false` (docs fast path) only when one of these holds:
#   1. every file the pull request changes is documentation AND the base commit passed the
#      required checks, or
#   2. on a pull request push, every file changed since the previous push is documentation
#      AND the previous head already passed the three required checks, so the full result
#      still holds (an ADR renumber or a CHANGELOG fix after review).
# A rename counts both its old and its new path. Anything else, including any error here,
# means `code=true`: CI never skips by accident. CI runs this file as it is on the base
# branch, so a pull request cannot change the rule that gates it.
#
# Env: EVENT, REPO, PR (number), BEFORE (previous head; empty on open), HEAD_SHA, BASE_SHA,
# GH_TOKEN.
set -uo pipefail

out() {
  echo "code=$1" >>"${GITHUB_OUTPUT:-/dev/stdout}"
  echo "code=$1 ($2)"
  exit 0
}

# Documentation: no file here can change the build or the app. Tests that read a docs file
# (csvGuide: docs/csv-import.md; adr-index: docs/adr) run in the docs job as well.
is_docs() {
  case "$1" in
    docs/* | *.md) return 0 ;;
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

conclusion_of() { # <sha> <check name>
  gh api "repos/$REPO/commits/$1/check-runs" -X GET -f check_name="$2" -f filter=latest \
    --jq '[.check_runs[] | select(.app.slug == "github-actions")][0].conclusion // "missing"'
}

# Green = every required check passed, or the commit itself took this fast path: then the
# three show as skipped beside a green "Docs", and it stood on a green commit in turn.
green() { # <sha>
  local docs check conclusion
  docs=$(conclusion_of "$1" "Docs (format · ADR index)") || return 1
  for check in "${REQUIRED[@]}"; do
    conclusion=$(conclusion_of "$1" "$check") || return 1
    [[ "$conclusion" == success || ("$conclusion" == skipped && "$docs" == success) ]] ||
      return 1
  done
}

[[ "${EVENT:-}" == pull_request ]] || out true "not a pull request"

files=$(gh api --paginate "repos/$REPO/pulls/$PR/files" \
  --jq '.[] | .filename, (.previous_filename // empty)') ||
  out true "could not list the pull request's files"
# The files API stops at 3000 files without an error.
(($(wc -l <<<"$files") < 3000)) || out true "too many files to list"
if all_docs <<<"$files"; then
  green "$BASE_SHA" && out false "the pull request changes only documentation"
  out true "documentation only, but the base commit is not green"
fi

[[ -n "${BEFORE:-}" && "$BEFORE" != 0000000000000000000000000000000000000000 ]] ||
  out true "no previous push to compare with"

# `ahead` = the new head only adds commits on top of the old one (no rebase, no force push).
compare=$(gh api "repos/$REPO/compare/$BEFORE...$HEAD_SHA" \
  --jq '.status, (.files | length), (.files[] | .filename, (.previous_filename // empty))') ||
  out true "could not compare with the previous push"
status=$(sed -n 1p <<<"$compare")
count=$(sed -n 2p <<<"$compare")
[[ "$status" == ahead ]] || out true "previous push is not an ancestor ($status)"
# The compare API lists at most 300 files.
((count > 0 && count < 300)) || out true "$count files since the previous push"
tail -n +3 <<<"$compare" | all_docs || out true "code changed since the previous push"

green "$BEFORE" || out true "the previous push is not green"
out false "only documentation changed since a fully green push"
