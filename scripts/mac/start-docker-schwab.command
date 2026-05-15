#!/usr/bin/env bash
# Bandaru Trade Research — Docker + Schwab launcher (Mac)
# Brings up 4 containers: Mongo + Schwab sidecar + Express + nginx.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
URL="http://localhost:3000"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Bandaru Trade Research — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m  Mode: Docker + Schwab (real-time)\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "✗ Docker Desktop isn't running. Open it and try again."
  exit 1
fi

if [ ! -f "legacy-python/schwab_token.json" ]; then
  echo "✗ No Schwab token. Run auth-schwab.command first (one-time browser flow)."
  exit 1
fi
echo "→ Schwab token present"

[ -f .env ] || { echo "✗ .env missing."; exit 1; }
grep -q '^SCHWAB_API_KEY=.\+' .env || { echo "✗ SCHWAB_API_KEY missing"; exit 1; }
grep -q '^SCHWAB_APP_SECRET=.\+' .env || { echo "✗ SCHWAB_APP_SECRET missing"; exit 1; }

echo "→ Starting Mongo + Schwab sidecar + Express + nginx..."
cd mern
DATA_SOURCE=schwab docker compose --profile schwab up -d --build

echo
echo "→ Waiting for the Schwab sidecar health check..."
for i in $(seq 1 30); do
  if docker inspect --format='{{.State.Health.Status}}' bandaru-schwab 2>/dev/null | grep -q healthy; then
    echo "  ✓ Schwab sidecar healthy"
    break
  fi
  sleep 2
done

echo
echo "✓ Stack is up. Opening $URL"
open "$URL" 2>/dev/null || true
echo
echo "Sidecar logs:    docker compose logs -f schwab"
echo "Stop:            double-click stop.command"
echo
echo "If the dashboard shows 'no data':"
echo "  • docker compose logs schwab    — check for token errors"
echo "  • re-run auth-schwab.command    — if the refresh token expired"
