#!/bin/sh
set -e

API_PORT="${API_INTERNAL_PORT:-3001}"
WEB_PORT="${PORT:-3000}"

mkdir -p "${UPLOAD_DIR:-/app/data/capes}"
mkdir -p "$(dirname "${AUDIT_LOG:-/app/data/audit.log}")"

export PORT="${API_PORT}"

echo "[panel] Starting API on 127.0.0.1:${API_PORT}"
node /app/api/dist/index.js &
API_PID=$!

export PORT="${WEB_PORT}"
cd /app/web
echo "[panel] Starting Next.js on 0.0.0.0:${WEB_PORT}"

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup INT TERM

exec npm start -- -p "${WEB_PORT}" -H 0.0.0.0
