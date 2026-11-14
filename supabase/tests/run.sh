#!/usr/bin/env bash
# Database checks. Needs a plain Postgres 15 or 16 you can create databases in. Uses the standard PGHOST / PGPORT / PGUSER / PGPASSWORD variables.
#   1. schema-current.sql loads on an empty database and the money, approval, customer and readiness rules behave (001_core.sql).
#   2. Running every migration in migration-order.txt builds the same database as schema-current.sql (so the single file cannot go stale).
# Nothing here touches your live Supabase.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; sup="$here/.."
q() { psql -v ON_ERROR_STOP=1 -q "$@"; }
fresh() { q -d postgres -c "drop database if exists $1" -c "create database $1"; q -d "$1" -f "$here/stubs.sql"; }

echo "== 1. schema-current.sql loads and the rules hold"
fresh swaasa_test
q -d swaasa_test -f "$sup/schema-current.sql"
q -d swaasa_test -f "$here/001_core.sql"

echo "== 2. the migration chain builds the same database as schema-current.sql"
fresh swaasa_chain
while IFS= read -r f; do
  [[ -z "$f" || "$f" == \#* ]] && continue
  q -d swaasa_chain -f "$sup/$f" >/dev/null || { echo "FAILED while applying $f"; exit 1; }
done < "$sup/migration-order.txt"
count="select (select count(*) from pg_tables where schemaname='public'), (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'), (select count(*) from pg_policies where schemaname='public'), (select count(*) from pg_trigger where not tgisinternal), (select count(*) from pg_indexes where schemaname='public')"
a=$(psql -d swaasa_test -Atc "$count"); b=$(psql -d swaasa_chain -Atc "$count")
echo "tables|functions|policies|triggers|indexes   schema-current: $a   migrations: $b"
if [ "$a" != "$b" ]; then echo "MISMATCH: schema-current.sql is out of date. Run supabase/tests/regenerate-schema.sh"; exit 1; fi
a=$(psql -d swaasa_test -Atf "$here/acl.sql"); b=$(psql -d swaasa_chain -Atf "$here/acl.sql")
echo "permissions   schema-current: $a   migrations: $b"
if [ "$a" != "$b" ]; then echo "MISMATCH: permissions differ. Run supabase/tests/regenerate-schema.sh"; exit 1; fi
echo "ALL DATABASE CHECKS PASSED"
