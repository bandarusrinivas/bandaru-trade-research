#!/usr/bin/env bash
# Bandaru Trade Research — local launcher (Mac, no Docker)
# Runs Express + Vite directly with installed Node 18+.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
URL="http://localhost:5173"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Bandaru Trade Research — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m  Mode: Local Node (dev, Yahoo data)\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js is not installed."
  echo "  Install Node 20+ from https://nodejs.org or run 'brew install node'."
  exit 1
fi
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ Node $NODE_MAJOR detected. Need Node 18 or newer."
  exit 1
fi
echo "→ Node $(node -v) detected"

echo "  - Installing server deps (if needed)..."
( cd mern/server && [ -d node_modules ] || npm install --no-audit --no-fund )
echo "  - Installing client deps (if needed)..."
( cd mern/client && [ -d node_modules ] || npm install --no-audit --no-fund )

MONGO_URI_VAL="mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300"
if nc -z 127.0.0.1 27017 2>/dev/null; then
  echo "  - Local MongoDB detected on :27017 — Trade Journal enabled"
  MONGO_URI_VAL="mongodb://127.0.0.1:27017/bandaru"
else
  echo "  - No MongoDB on :27017 — Trade Journal disabled (everything else works)"
fi

echo
echo "  - Booting Express on :4000..."
( cd mern/server && MONGO_URI="$MONGO_URI_VAL" node server.js ) > /tmp/bandaru-server.log 2>&1 &
SERVER_PID=$!
echo "    PID $SERVER_PID  logs: /tmp/bandaru-server.log"

echo "  - Booting Vite dev server on :5173..."
( cd mern/client && npm run dev ) > /tmp/bandaru-client.log 2>&1 &
CLIENT_PID=$!
echo "    PID $CLIENT_PID  logs: /tmp/bandaru-client.log"

echo "$SERVER_PID $CLIENT_PID" > /tmp/bandaru.pids

echo
echo "Waiting for the dev server to come up..."
for i in $(seq 1 30); do
  if curl -fs "$URL" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "✓ Opening $URL"
open "$URL" 2>/dev/null || true
echo
echo "Stop:    double-click stop.command"
