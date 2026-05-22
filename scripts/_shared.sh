#!/usr/bin/env bash
# Bandaru Trade Research — shared bash helper for launcher scripts (Mac).
# Source this file from any .command script. Provides:
#   resolve_root, banner, step, ok, warn, fail, info
#   close_browser_tabs <url-substring>
#   open_browser <url>
#   wait_for_url <url> [timeout-seconds]
#   docker_up, docker_compose_root, port_owners <port>, kill_non_docker_pids
#   verify_data_source <expected> [timeout]

# ───────────────────────── path resolution ─────────────────────────
resolve_root() {
  # Every launcher (start/stop/auth/cleanup) lives at the project root.
  # Resolve ROOT from the calling script's own location and cd into it.
  local self="${BASH_SOURCE[1]:-$0}"
  ROOT="$(cd "$(dirname "$self")" && pwd)"
  cd "$ROOT" || exit 1
  export ROOT
}

# ───────────────────────── pretty printing ─────────────────────────
banner() {
  local title="$1"
  printf '\n\033[1;36m╔══════════════════════════════════════════════════════════════╗\033[0m\n'
  printf '\033[1;36m║  %-60s  ║\033[0m\n' "$title"
  printf '\033[1;36m╚══════════════════════════════════════════════════════════════╝\033[0m\n\n'
}
step() { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[1;31m✗\033[0m %s\n' "$1"; }
info() { printf '  %s\n' "$1"; }

# ─────────────────────── browser tab handling ──────────────────────
# Close all open tabs (across Chrome, Safari, Comet, Arc, Edge) whose URL
# contains the given substring. Silent if a browser isn't installed.
close_browser_tabs() {
  local needle="$1"
  [ -n "$needle" ] || return 0

  # Generic AppleScript template — runs against any Chromium-based or
  # Safari-based app that exposes the standard "windows/tabs" object model.
  _close_for() {
    local app="$1"
    osascript <<EOF 2>/dev/null || true
      if application "$app" is running then
        tell application "$app"
          try
            repeat with w in windows
              set i to (count tabs of w)
              repeat while i ≥ 1
                try
                  if URL of tab i of w contains "$needle" then
                    close tab i of w
                  end if
                end try
                set i to i - 1
              end repeat
            end repeat
          end try
        end tell
      end if
EOF
  }

  for app in "Google Chrome" "Safari" "Comet" "Arc" "Microsoft Edge" "Brave Browser" "Vivaldi"; do
    _close_for "$app"
  done
}

# Open a URL in the user's default browser. macOS `open` handles this natively.
open_browser() {
  local url="$1"
  open "$url" 2>/dev/null || true
}

# Wait until a URL responds with HTTP 2xx/3xx, polling every second.
# Returns 0 on success, 1 on timeout.
wait_for_url() {
  local url="$1"
  local timeout="${2:-30}"
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    if curl -fs --max-time 2 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# ─────────────────────── docker convenience ────────────────────────
docker_up() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

# Print the project's docker-compose root path (always mern/)
docker_compose_root() {
  echo "$ROOT/mern"
}

# ─────────────────────── port / process safety ─────────────────────
# List PIDs listening on a port (one per line)
port_owners() {
  lsof -ti :"$1" 2>/dev/null || true
}

# Check whether a PID belongs to Docker Desktop (don't kill those!)
is_docker_pid() {
  local pid="$1"
  local cmd
  cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
  case "$cmd" in
    *com.docker*|*Docker*|*vpnkit*|*docker-credential*) return 0 ;;
    *) return 1 ;;
  esac
}

# Kill only non-Docker processes on the given port(s)
kill_non_docker_pids() {
  for PORT in "$@"; do
    for PID in $(port_owners "$PORT"); do
      if is_docker_pid "$PID"; then
        : # silent skip — Docker's port forwarder
      else
        kill -9 "$PID" 2>/dev/null && info "killed non-Docker PID $PID on :$PORT"
      fi
    done
  done
}

# ─────────────────── data-source verification ──────────────────────
# Poll /api/version until configured_source matches what we expect.
# Returns 0 if reached, 1 on timeout.
verify_data_source() {
  local expected="$1"
  local timeout="${2:-30}"
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    local got
    got=$(curl -fs --max-time 2 http://localhost:4000/api/version 2>/dev/null \
          | python3 -c "import sys,json; print(json.load(sys.stdin).get('configured_source','?'))" 2>/dev/null \
          || echo "?")
    if [ "$got" = "$expected" ]; then return 0; fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# Verify Schwab is *actually* serving live data — not just configured.
# /api/version reports configured_source=schwab even when the token is dead
# and the server has silently fallen back to Yahoo. /api/diagnose probes the
# Schwab adapter directly, so it tells the truth. Prints the precise reason
# on failure. Returns 0 if Schwab data is live, 1 otherwise.
verify_schwab_live() {
  local timeout="${1:-30}"
  local tmp="${TMPDIR:-/tmp}/bandaru_diagnose.json"
  local i=0
  # Globals the caller can read after this returns.
  SCHWAB_LIVE_REASON=""
  SCHWAB_LIVE_ACTIVE=""
  rm -f "$tmp"
  while [ "$i" -lt "$timeout" ]; do
    if curl -fs --max-time 12 "http://localhost:4000/api/diagnose?ticker=SPY" -o "$tmp" 2>/dev/null \
       && [ -s "$tmp" ]; then
      break
    fi
    sleep 1
    i=$((i + 1))
  done
  if [ ! -s "$tmp" ]; then
    SCHWAB_LIVE_REASON="the Express server is not responding"
    fail "Could not reach /api/diagnose — the Express server isn't responding."
    return 1
  fi

  local parsed state active rec
  parsed=$(python3 - "$tmp" <<'PY' 2>/dev/null || true
import sys, json
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("ERR|unknown|could not parse the diagnose response"); raise SystemExit(0)
sc = d.get("schwab") or {}
avail = bool(sc.get("available"))
active = d.get("active_source") or "unknown"
rec = (d.get("recommendation") or "").replace("\n", " ").strip()
print(("OK" if avail else "NO") + "|" + active + "|" + rec)
PY
)
  state="${parsed%%|*}"
  rec="${parsed##*|}"
  active="${parsed#*|}"; active="${active%%|*}"
  SCHWAB_LIVE_REASON="$rec"
  SCHWAB_LIVE_ACTIVE="$active"

  if [ "$state" = "OK" ]; then
    ok "Schwab is serving live real-time data"
    return 0
  fi
  fail "Schwab is NOT serving data — the dashboard is on '$active' data."
  [ -n "$rec" ] && info "Reason: $rec"
  info "Full report:  open http://localhost:4000/api/diagnose?ticker=SPY"
  return 1
}
