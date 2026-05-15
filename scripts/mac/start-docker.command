#!/usr/bin/env bash
# Bandaru Trade Research — Docker launcher (Mac)
# Production stack: Mongo + Express + nginx-served React. Requires Docker Desktop.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
URL="http://localhost:3000"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Bandaru Trade Research — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m  Mode: Docker (production, Yahoo data)\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker Desktop is not installed."
  echo "  Install from https://www.docker.com/products/docker-desktop/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker Desktop is installed but the daemon isn't running."
  echo "  Open Docker Desktop, wait for the whale icon, then re-run."
  exit 1
fi

echo "→ Building images + starting Mongo + Express + nginx..."
cd mern
docker compose up -d --build
echo
echo "✓ Stack is up. Opening $URL"
open "$URL" 2>/dev/null || true
echo
echo "Tail logs:   docker compose logs -f         (from $ROOT/mern)"
echo "Stop:        double-click stop.command"
echo "Wipe data:   docker compose down -v          (erases Trade Journal)"
