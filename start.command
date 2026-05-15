#!/usr/bin/env bash
# Bandaru Trade Research — one-click launcher (Mac)
# Double-click this file in Finder. Tries Docker first; falls back to local Node dev.

set -e
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"
URL_PROD="http://localhost:3000"
URL_DEV="http://localhost:5173"

banner() {
  printf '\n\033[1;36m========================================\033[0m\n'
  printf '\033[1;36m  Bandaru Trade Research — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
  printf '\033[1;36m========================================\033[0m\n\n'
}

has() { command -v "$1" >/dev/null 2>&1; }

start_docker() {
  echo "→ Docker detected. Starting production stack..."
  cd "$PROJECT_ROOT/mern"
  docker compose up -d --build
  echo
  echo "✓ Stack is up. Opening $URL_PROD"
  open "$URL_PROD" 2>/dev/null || true
  echo
  echo "Tail logs:    docker compose logs -f"
  echo "Stop:         docker compose down"
  echo "Wipe data:    docker compose down -v"
}

start_dev() {
  echo "→ Docker not found. Starting local Node dev mode..."
  if ! has node; then
    echo "✗ Node.js is required. Install Node 20+ from https://nodejs.org or via 'brew install node'."
    exit 1
  fi
  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "✗ Node $NODE_MAJOR detected. Need Node 18 or newer."
    exit 1
  fi

  echo "  - Installing server deps (if needed)..."
  ( cd mern/server && [ -d node_modules ] || npm install --no-audit --no-fund )
  echo "  - Installing client deps (if needed)..."
  ( cd mern/client && [ -d node_modules ] || npm install --no-audit --no-fund )

  echo
  echo "  - Booting Express on :4000 (Trade Journal disabled without Mongo)..."
  ( cd mern/server && MONGO_URI="mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300" node server.js ) > /tmp/bandaru-server.log 2>&1 &
  SERVER_PID=$!
  echo "    PID $SERVER_PID  logs: /tmp/bandaru-server.log"

  echo "  - Booting Vite dev server on :5173..."
  ( cd mern/client && npm run dev ) > /tmp/bandaru-client.log 2>&1 &
  CLIENT_PID=$!
  echo "    PID $CLIENT_PID  logs: /tmp/bandaru-client.log"

  echo
  echo "Waiting for the dev server to come up..."
  for i in $(seq 1 30); do
    if curl -fs "$URL_DEV" >/dev/null 2>&1; then break; fi
    sleep 1
  done

  echo "✓ Opening $URL_DEV"
  open "$URL_DEV" 2>/dev/null || true
  echo
  echo "Stop:    kill $SERVER_PID $CLIENT_PID"
  echo "Or run:  $PROJECT_ROOT/stop.command"
  # Persist PIDs for stop.command
  echo "$SERVER_PID $CLIENT_PID" > /tmp/bandaru.pids
}

banner
if has docker && docker info >/dev/null 2>&1; then
  start_docker
else
  start_dev
fi
