#!/usr/bin/env bash
# Bandaru Trade Research — stop launcher (Mac)

set -e
cd "$(dirname "$0")"

echo "Stopping Bandaru Trade Research..."

# 1) Docker mode (include schwab profile so the sidecar comes down too)
if command -v docker >/dev/null 2>&1 && [ -f mern/docker-compose.yml ]; then
  if docker compose -f mern/docker-compose.yml --profile schwab ps --services 2>/dev/null | grep -q .; then
    echo "  - Bringing down docker compose stack..."
    ( cd mern && docker compose --profile schwab down )
  fi
fi

# 2) Dev mode — kill PIDs recorded by start.command
if [ -f /tmp/bandaru.pids ]; then
  for PID in $(cat /tmp/bandaru.pids); do
    if kill -0 "$PID" 2>/dev/null; then
      echo "  - Killing PID $PID"
      kill "$PID" 2>/dev/null || true
    fi
  done
  rm -f /tmp/bandaru.pids
fi

# 3) Belt-and-suspenders: kill any stray process on :4000 / :5173 / :5000
#    4000 = MERN Express, 5173 = Vite dev, 5000 = legacy Python Flask
for PORT in 4000 5173 5000; do
  PID=$(lsof -ti :$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "  - Killing leftover process on port $PORT (PID $PID)"
    kill "$PID" 2>/dev/null || true
  fi
done

echo "✓ Stopped."
