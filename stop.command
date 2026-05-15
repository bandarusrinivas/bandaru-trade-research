#!/usr/bin/env bash
# Bandaru Trade Research — stop launcher (Mac)

set -e
cd "$(dirname "$0")"

echo "Stopping Bandaru Trade Research..."

# 1) Docker mode
if command -v docker >/dev/null 2>&1 && [ -f mern/docker-compose.yml ]; then
  if docker compose -f mern/docker-compose.yml ps --services 2>/dev/null | grep -q .; then
    echo "  - Bringing down docker compose stack..."
    ( cd mern && docker compose down )
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

# 3) Belt-and-suspenders: kill any stray node on :4000 / :5173
for PORT in 4000 5173; do
  PID=$(lsof -ti :$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "  - Killing leftover process on port $PORT (PID $PID)"
    kill "$PID" 2>/dev/null || true
  fi
done

echo "✓ Stopped."
