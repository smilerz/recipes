#!/usr/bin/env bash
# Append a [tool.mutmut] section to ./pyproject.toml.
#
#   mutation_mutmut_config.sh "<file.py>,<file.py>" "<test_file.py>,<test_file.py>"
#
# Written at run time into the CI checkout rather than committed, because the files to mutate and
# the tests to run against them change on every run and mutmut reads its settings only from a
# config file. The tests are named explicitly: mutmut would otherwise run the whole suite once to
# find which tests cover which code, and the suite does not pass in a single process.
set -euo pipefail

quote_list() {
    local out="" item
    local IFS=','
    for item in $1; do
        out+="\"$item\", "
    done
    printf '%s' "${out%, }"
}

cat >> pyproject.toml <<EOF

[tool.mutmut]
source_paths = ["cookbook/"]
only_mutate = [$(quote_list "$1")]
do_not_mutate = ["cookbook/migrations/*", "cookbook/tests/*"]
also_copy = ["recipes/", "manage.py", "plugin.py", "version.py", "pytest.ini"]
pytest_add_cli_args = ["--ds=mutation_settings", "--reuse-db", "-o", "addopts=", "-p", "no:cacheprovider", "-p", "no:xdist"]
pytest_add_cli_args_test_selection = [$(quote_list "$2")]
EOF
