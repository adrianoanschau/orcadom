"""Row-count helpers used by dump manifests and restore verification."""

from __future__ import annotations

import json
import os
import subprocess
from typing import Mapping

TABLES_SQL = """
SELECT n.nspname || ',' || c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1;
"""


def quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def psql_env(
    host: str,
    port: str,
    user: str,
    password: str,
    database: str,
) -> dict[str, str]:
    env = os.environ.copy()
    env["PGHOST"] = host
    env["PGPORT"] = str(port)
    env["PGUSER"] = user
    env["PGPASSWORD"] = password
    env["PGDATABASE"] = database
    env.setdefault("PGSSLMODE", "prefer")
    return env


def _psql(env: Mapping[str, str], sql: str) -> str:
    return subprocess.check_output(
        ["psql", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        env=dict(env),
        text=True,
        stderr=subprocess.STDOUT,
    )


def list_tables(env: Mapping[str, str]) -> list[tuple[str, str]]:
    rows = [line for line in _psql(env, TABLES_SQL).splitlines() if line]
    tables: list[tuple[str, str]] = []
    for row in rows:
        schema, table = row.split(",", 1)
        tables.append((schema, table))
    return tables


def collect_counts(env: Mapping[str, str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for schema, table in list_tables(env):
        sql = f"SELECT count(*) FROM {quote_ident(schema)}.{quote_ident(table)}"
        counts[f"{schema}.{table}"] = int(_psql(env, sql).strip())
    return counts


def compare_counts(expected: dict[str, int], actual: dict[str, int]) -> list[str]:
    diffs: list[str] = []
    for name, value in sorted(expected.items()):
        got = actual.get(name)
        if got != value:
            diffs.append(f"{name}: expected {value}, got {got}")
    extra = sorted(set(actual) - set(expected))
    for name in extra:
        diffs.append(f"{name}: unexpected table with {actual[name]} rows")
    return diffs


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    collect = sub.add_parser("collect")
    collect.add_argument("--host", required=True)
    collect.add_argument("--port", required=True)
    collect.add_argument("--user", required=True)
    collect.add_argument("--password", default="")
    collect.add_argument("--database", required=True)
    compare = sub.add_parser("compare")
    compare.add_argument("expected")
    compare.add_argument("actual")
    ident = sub.add_parser("quote-ident")
    ident.add_argument("value")
    literal = sub.add_parser("quote-literal")
    literal.add_argument("value")
    args = parser.parse_args()
    if args.command == "collect":
        env = psql_env(args.host, args.port, args.user, args.password, args.database)
        print(json.dumps(collect_counts(env), sort_keys=True))
        return 0
    if args.command == "quote-ident":
        print(quote_ident(args.value), end="")
        return 0
    if args.command == "quote-literal":
        print(quote_literal(args.value), end="")
        return 0
    expected = json.loads(__import__("pathlib").Path(args.expected).read_text(encoding="utf-8"))
    actual = json.loads(__import__("pathlib").Path(args.actual).read_text(encoding="utf-8"))
    diffs = compare_counts(expected, actual)
    if diffs:
        print("\n".join(diffs))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
