#!/usr/bin/env bash
# Print the test files to run against the given modules, comma separated.
#
#   mutation_backend_tests.sh <module.py>...
#
# For each module the dedicated test file(s), `test_<module>*.py`, are used when they exist.
# Otherwise every test file that names the module (its file name without `.py`) as a whole word is
# used, which catches imports and patch targets. Dedicated files come first because mutmut runs
# the selected tests more than once in one process, and heavier integration tests that merely
# mention a module (test_url_import.py rewrites its own parametrize data) break on the second run.
# Prints nothing when no test mentions any of them, which is itself worth reporting: nothing
# exercises that code.
set -euo pipefail

found=""
for module in "$@"; do
    name=$(basename "$module" .py)
    dedicated=$(find cookbook/tests -name "test_${name}*.py" | sort)
    if [ -n "$dedicated" ]; then
        found+="$dedicated"
    else
        found+=$(grep -rlw --include='*.py' -- "$name" cookbook/tests || true)
    fi
    found+=$'\n'
done

# Tests that read the source files themselves cannot run against mutmut's mutated copy, which holds
# every variant of every function side by side: the raw write audit sees each variant as a new write.
printf '%s\n' "$found" | sed '/^$/d' | { grep -v '/test_raw_write_audit\.py$' || true; } | sort -u | paste -sd, -
