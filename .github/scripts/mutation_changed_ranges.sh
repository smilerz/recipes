#!/usr/bin/env bash
# Print the line ranges a PR changed, one `path:start-end` per line, for scoping mutation runs.
#
#   mutation_changed_ranges.sh <base-ref> <strip-prefix> -- <git pathspec>...
#
# Paths are printed relative to <strip-prefix> (e.g. `vue3` turns `vue3/src/a.ts` into `src/a.ts`).
# Pure deletions have no lines left to mutate and are skipped; so are deleted files.
set -euo pipefail

base="$1"
strip="$2"
shift 3

git diff -U0 --no-color "$base...HEAD" -- "$@" | awk -v strip="$strip/" '
    /^\+\+\+ b\// {
        file = substr($0, 7)
        if (index(file, strip) == 1) file = substr(file, length(strip) + 1)
        next
    }
    /^@@/ {
        split($3, range, ",")
        start = substr(range[1], 2) + 0
        count = (range[2] == "" ? 1 : range[2] + 0)
        if (count > 0) printf "%s:%d-%d\n", file, start, start + count - 1
    }
'
