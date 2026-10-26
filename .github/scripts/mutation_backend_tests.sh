#!/usr/bin/env bash
# Print the test files that mention any of the given modules, comma separated.
#
#   mutation_backend_tests.sh <module.py>...
#
# A test file counts when it names the module (its file name without `.py`) as a whole word, which
# catches imports and patch targets. Prints nothing when no test mentions any of them, which is
# itself worth reporting: nothing exercises that code.
set -euo pipefail

found=""
for module in "$@"; do
    name=$(basename "$module" .py)
    found+=$(grep -rlw --include='*.py' -- "$name" cookbook/tests || true)
    found+=$'\n'
done

printf '%s\n' "$found" | sed '/^$/d' | sort -u | paste -sd, -
