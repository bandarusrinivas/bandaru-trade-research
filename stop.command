#!/usr/bin/env bash
# Bandaru Trade Research — universal stop (Mac).
# Tears down whichever mode is currently running (Docker / Local / Python)
# and closes the dashboard browser tabs.

# shellcheck disable=SC1091
source "$(dirname "$0")/scripts/_shared.sh"
resolve_root

banner "Bandaru Trade Research — STOP"

# ───────────────────────── 1. Docker stack ─────────────────────────
step "1. Stopping Docker containers (all profiles)"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if [ -f mern/docker-compose.yml ]; then
    (
      cd mern
      # All known profiles
      docker compose --profile schwab down --remove-orphans 2>&1 | sed 's/^/  /' || true
    )
    # Force-remove any zombie bandaru containers
    for c in bandaru-mongo bandaru-schwab bandaru-server bandaru-client; do
      if docker ps -aq -f "name=^${c}$" 2>/dev/null | grep -q .; then
        docker rm -f "$c" >/dev/null 2>&1 && ok "removed zombie container $c"
      fi
    done
  fi
else
  info "Docker not running — skipping container cleanup"
fi

# ─────────────────────── 2. Local Node / Vite ──────────────────────
step "2. Stopping local Node processes"
if [ -f /tmp/bandaru.pids ]; then
  for PID in $(cat /tmp/bandaru.pids); do
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null && ok "killed PID $PID (tracked)"
    fi
  done
  rm -f /tmp/bandaru.pids
fi

# ──────────────── 3. Sweep non-Docker leftovers on app ports ───────
step "3. Sweeping non-Docker leftovers on :4000 :5000 :5173"
kill_non_docker_pids 4000 5000 5173

# ──────────────────────── 4. Browser tabs ──────────────────────────
step "4. Closing dashboard tabs in your browsers"
close_browser_tabs "localhost:3000"
close_browser_tabs "localhost:5173"
close_browser_tabs "127.0.0.1:5000"
close_browser_tabs "localhost:4000/api/diagnose"
ok "closed any matching tabs (Chrome, Safari, Comet, Arc, Edge, Brave, Vivaldi)"

echo
ok "Stopped."
echo "  Re-launch:  double-click start.command"
