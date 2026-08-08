#!/bin/sh

# Commit only the changes that are already staged in the current repository.
#
# This wrapper deliberately has a very small interface:
#   llm-commit-changes --message "Commit message"
#
# It does not accept Git options or paths, does not use eval, and never stages
# files. The caller must stage the intended files explicitly before invoking
# it. The commit message is passed as one quoted argument to Git.

set -eu

git_bin=/usr/bin/git

# Do not let caller-provided Git environment variables redirect the repository,
# index, configuration, editor, or diff implementation used by this wrapper.
unset GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS GIT_CONFIG_SYSTEM \
  GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR \
  GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
  GIT_EXTERNAL_DIFF GIT_DIFF_OPTS GIT_DIFF_PATHS \
  GIT_EDITOR GIT_SEQUENCE_EDITOR
export GIT_CONFIG_NOSYSTEM=1

usage() {
  printf '%s\n' 'Usage: llm-commit-changes --message "Commit message"' >&2
  exit 2
}

die() {
  printf 'llm-commit-changes: %s\n' "$1" >&2
  exit 1
}

if [ "$#" -ne 2 ] || [ "$1" != "--message" ]; then
  usage
fi

message=$2
[ -n "$message" ] || die "the commit message must not be empty"

if "$git_bin" diff --cached --quiet --exit-code --no-ext-diff --no-textconv; then
  die "no staged changes to commit"
fi

"$git_bin" diff --cached --check --no-ext-diff --no-textconv

# Disable all repository hooks and commit signing for this controlled commit.
# The fixed executable path, quoted message, -- separator, and absence of eval
# keep input data from becoming shell or Git options.
exec "$git_bin" \
  -c core.hooksPath=/dev/null \
  -c core.fsmonitor=false \
  -c commit.gpgSign=false \
  commit \
  --no-verify \
  --message="$message" \
  --
