#!/usr/bin/env bash
# Build and roll out AIReadBook on the server it runs on.
#
#   ssh haifeng@192.168.50.6 'cd /Volumes/Storage/Workspace/AIReadBook && deploy/deploy.sh'
#
# The build goes into .next-build and is smoke-tested on a side port, so the
# live site is only interrupted for the few seconds of the final swap. If the
# new build fails its health check the previous one is put back.
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR=$(pwd)
DATA_DIR=${DATA_DIR:-/Volumes/Storage/AIReadBook-data}
PORT=3000
SMOKE_PORT=3099
SERVICE=aireadbook

# shellcheck disable=SC1090
source "$HOME/.nvm/nvm.sh" >/dev/null
log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

env_value() { grep -hE "^$1=" .env.local .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r'; }

wait_healthy() { # port, seconds
  for _ in $(seq "$2"); do
    if curl -fsS -m 3 "http://127.0.0.1:$1/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

[ -n "$(env_value AUTH_SECRET)" ] || { echo "AUTH_SECRET is missing from .env.local" >&2; exit 1; }

log "Backing up database"
mkdir -p "$DATA_DIR/backups"
url=$(env_value DATABASE_URL)
db_user=$(sed -E 's#.*://([^:]+):.*#\1#' <<<"$url")
db_pass=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' <<<"$url")
db_host=$(sed -E 's#.*@([^:/]+).*#\1#' <<<"$url")
db_name=$(sed -E 's#.*/([^/?]+)(\?.*)?$#\1#' <<<"$url")
backup="$DATA_DIR/backups/$db_name-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).sql.gz"
MYSQL_PWD="$db_pass" mysqldump -h "$db_host" -u "$db_user" --single-transaction --no-tablespaces "$db_name" | gzip >"$backup"
ls -t "$DATA_DIR"/backups/*.sql.gz | tail -n +31 | xargs -r rm -f   # keep the newest 30
echo "$backup"

log "Installing dependencies"
# Not `npm ci`: that deletes node_modules first, under the live server's feet.
npm install --no-audit --no-fund

log "Syncing database schema"
npx prisma generate
npx prisma db push --skip-generate
if [ -f prisma/post-push.sql ]; then
  MYSQL_PWD="$db_pass" mysql -h "$db_host" -u "$db_user" "$db_name" <prisma/post-push.sql
fi

log "Type-check and unit tests"
npx tsc --noEmit
npx vitest run

log "Building into .next-build"
rm -rf .next-build
NEXT_DIST_DIR=.next-build npx next build

log "Smoke-testing the new build on :$SMOKE_PORT"
NEXT_DIST_DIR=.next-build npx next start -H 127.0.0.1 -p "$SMOKE_PORT" >/tmp/aireadbook-smoke.log 2>&1 &
smoke_pid=$!
trap 'kill $smoke_pid 2>/dev/null || true' EXIT
if ! wait_healthy "$SMOKE_PORT" 40; then
  echo "New build failed its health check; live site untouched." >&2
  tail -30 /tmp/aireadbook-smoke.log >&2
  exit 1
fi
kill $smoke_pid 2>/dev/null || true; wait $smoke_pid 2>/dev/null || true
trap - EXIT

log "Swapping builds and restarting"
sudo -n systemctl stop "$SERVICE"
rm -rf .next-prev
[ -d .next ] && mv .next .next-prev
mv .next-build .next
sudo -n systemctl start "$SERVICE"

if wait_healthy "$PORT" 40; then
  log "Deployed $(git rev-parse --short HEAD) — healthy on :$PORT"
else
  log "New build unhealthy on :$PORT — rolling back"
  sudo -n systemctl stop "$SERVICE"
  rm -rf .next && mv .next-prev .next
  sudo -n systemctl start "$SERVICE"
  wait_healthy "$PORT" 40 && echo "Rolled back to previous build." >&2
  exit 1
fi
