#!/usr/bin/env bash
# Bandaru Trade Research — Docker launcher (Mac)
# Runs the full production stack: Mongo + Express + nginx-served React.
# Requires Docker Desktop.

set -e
cd "$(dirname "$0")"
URL="http://localhost:3000"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Bandaru Trade Research — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m  Mode: Docker (production)\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker is not installed."
  echo "  Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
  echo "  Or use start-local.command if you'd rather run with local Node."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is installed but the daemon isn't running."
  echo "  Open Docker Desktop, wait for it to start, then re-run this script."
  exit 1
fi

echo "→ Building images + starting Mongo + Express + nginx..."
cd mern
docker compose up -d --build
echo
echo "✓ Stack is up. Opening $URL"
open "$URL" 2>/dev/null || true
echo
echo "Tail logs:    docker compose logs -f         (run from $(pwd))"
echo "Stop:         double-click stop.command       (or 'docker compose down')"
echo "Wipe data:    docker compose down -v          (erases Trade Journal)"
