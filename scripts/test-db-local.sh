#!/usr/bin/env bash
# Sobe um PostgreSQL temporário e descartável, aplica as migrations e roda os testes de RLS.
# Requisitos: binários do PostgreSQL 15+ (initdb, pg_ctl) no PATH ou em /usr/lib/postgresql/*/bin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"
PORT="${PGPORT_TEST:-54329}"
DIR="$(mktemp -d /tmp/diario-pg.XXXXXX)"
RUN=""
if [ "$(id -u)" = "0" ]; then # o postgres não roda como root
  U="postgres"; id "$U" >/dev/null 2>&1 || { U="pgtest"; id "$U" >/dev/null 2>&1 || useradd -m "$U"; }
  chown -R "$U" "$DIR"; RUN="runuser -u $U --"
fi
cleanup() { $RUN pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
$RUN initdb -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN pg_ctl -D "$DIR/data" -o "-p $PORT -c listen_addresses=127.0.0.1 -k $DIR" -l "$DIR/log" -w start >/dev/null
export DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/postgres"
cd "$ROOT" && npx vitest run tests/integration --no-file-parallelism "$@"
