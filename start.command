#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Bandaru Trade Research — START  (Mac)
#
#  The ONE command to launch everything. Just double-click it.
#    • Checks Docker (and starts Docker Desktop if needed)
#    • If the Schwab token is missing/expired, lets you CHOOSE:
#        sign in now, or run on free delayed Yahoo data
#    • Builds + starts every container
#    • Verifies real-time data is flowing
#    • Opens the dashboard
#
#  To stop everything:  double-click  stop.command
# ════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
URL="http://localhost:3000"

# shellcheck disable=SC1091
source "$ROOT/scripts/_shared.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/check-schwab-token.sh"

banner "Bandaru Trade Research v$(cat VERSION 2>/dev/null || echo dev) — START"

# ─────────────────────── 1. Docker ─────────────────────────────────
step "1. Checking Docker"
if ! docker_up; then
  warn "Docker Desktop isn't running — trying to start it..."
  open -a Docker 2>/dev/null || true
  for _ in $(seq 1 30); do      # wait up to ~60s
    sleep 2
    docker_up && break
  done
  if ! docker_up; then
    fail "Docker Desktop still isn't ready."
    info "Open Docker Desktop manually, wait for the whale icon, then"
    info "double-click start.command again."
    exit 1
  fi
fi
ok "Docker is running"

# ─────────────────── 2. Environment file + data source ─────────────
step "2. Setting up the environment"

# docker compose --env-file needs the .env file to exist — even on free
# Yahoo data. On a fresh copy there is no .env (it's git-ignored so no
# secrets are ever committed), so seed one from .env.example. This makes
# start.command work no matter which folder it is launched from.
if [ ! -f "$ROOT/.env" ]; then
  if [ -f "$ROOT/.env.example" ]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    info "No .env found — created one from .env.example (placeholder keys)."
    info "Add real SCHWAB_API_KEY / SCHWAB_APP_SECRET to .env for live data."
  else
    : > "$ROOT/.env"
    warn "No .env or .env.example found — created an empty .env."
  fi
else
  ok ".env found"
fi

# MODE ends up "schwab" (real-time) or "yahoo" (free, ~15-min delayed).
MODE=""

# Real Schwab credentials present? The placeholder values shipped in
# .env.example (your_schwab_app_key / your_schwab_app_secret) do NOT count.
HAS_CREDS=0
if grep -Eq '^SCHWAB_API_KEY=.+' "$ROOT/.env" \
   && grep -Eq '^SCHWAB_APP_SECRET=.+' "$ROOT/.env" \
   && ! grep -Eq '^SCHWAB_API_KEY=your_' "$ROOT/.env" \
   && ! grep -Eq '^SCHWAB_APP_SECRET=your_' "$ROOT/.env"; then
  HAS_CREDS=1
fi

if [ "$HAS_CREDS" = "0" ]; then
  warn "No Schwab API keys found in .env."
  info "Starting on free Yahoo data (~15-min delayed). Add SCHWAB_API_KEY and"
  info "SCHWAB_APP_SECRET to .env for real-time data."
  MODE="yahoo"
else
  # Credentials exist — is the token usable?
  TOKEN_OK=0
  if [ -f legacy-python/schwab_token.json ]; then
    TOKEN_RC=0
    schwab_token_check legacy-python/schwab_token.json || TOKEN_RC=$?
    [ "$TOKEN_RC" -le 1 ] && TOKEN_OK=1      # 0 = fresh, 1 = aging but still valid
  fi

  if [ "$TOKEN_OK" = "1" ]; then
    ok "Schwab token is valid — launching with real-time data."
    MODE="schwab"
  else
    # Token missing or expired — let the user choose.
    echo
    echo "  A Schwab sign-in is needed for real-time data. What would you like to do?"
    echo
    echo "    1) Sign in to Schwab now    — real-time data        (recommended)"
    echo "    2) Skip the sign-in         — free delayed Yahoo data"
    echo "    3) Quit"
    echo
    read -p "  Your choice [1/2/3, default 1]: " choice
    case "${choice:-1}" in
      2)
        info "OK — starting on free delayed Yahoo data."
        MODE="yahoo" ;;
      3)
        echo "  Cancelled. Nothing was started."
        exit 0 ;;
      *)
        MODE="schwab"
        echo
        info "A browser will open for Schwab sign-in. Follow the prompts here."
        echo
        if ! "$ROOT/auth-schwab.command"; then
          warn "Sign-in didn't finish — falling back to delayed Yahoo data."
          warn "You can re-run start.command any time to try Schwab again."
          MODE="yahoo"
        fi ;;
    esac
  fi
fi

# ─────────────────────── 3. Launch the stack ───────────────────────
step "3. Starting the containers ($MODE data)"
(
  cd mern
  docker compose --profile schwab down --remove-orphans >/dev/null 2>&1 || true
  if [ "$MODE" = "schwab" ]; then
    docker compose --env-file "$ROOT/.env" \
      -f docker-compose.yml -f docker-compose.schwab.yml --profile schwab \
      up -d --build --force-recreate 2>&1 | sed 's/^/  /'
  else
    # Yahoo mode — DATA_SOURCE=yahoo overrides the .env default, but we still
    # include `--profile schwab` so the Schwab sidecar container is BUILT and
    # STARTED. The server ignores it (DATA_SOURCE=yahoo), but the sidecar is
    # ready for auth-schwab-docker.command to re-OAuth without a rebuild step.
    DATA_SOURCE=yahoo docker compose --env-file "$ROOT/.env" \
      -f docker-compose.yml --profile schwab \
      up -d --build --force-recreate 2>&1 | sed 's/^/  /'
  fi
)
ok "Containers started"

# ─────────────────── 4. Wait for the server AND the UI ─────────────
# The browser opens $URL — the UI on :3000. Wait for BOTH the API and the
# UI container, otherwise the page can open before nginx is ready and show
# an empty screen with no data.
step "4. Waiting for the dashboard to come online"
if wait_for_url "http://localhost:4000/api/version" 120; then
  ok "API server is up"
else
  warn "API server is slow to start — check:  ( cd mern && docker compose logs -f )"
fi
if wait_for_url "$URL" 60; then
  ok "Dashboard UI is up"
else
  warn "Dashboard UI is slow to start — give it a few seconds, then refresh."
fi

# ─────────────────────── 5. Verify Schwab data ─────────────────────
# Only relevant in Schwab mode.
#
# Token-persistence policy: step 2 already validated the local Schwab token
# (refresh-token age < 7 days). If we got here, the token IS still usable, so
# a verify failure right now is almost always transient — containers still
# warming up on a first build, sidecar mid-initialisation, a single rejected
# request, etc. We do NOT re-prompt for sign-in in those cases; the circuit
# breaker / Yahoo fallback handles it gracefully and the next page refresh
# will pick up real-time data once the sidecar is fully up. Re-auth only
# happens when the local token-age check itself fails (handled in step 2).
SCHWAB_LIVE=0
if [ "$MODE" = "schwab" ]; then
  step "5. Checking real-time Schwab data"
  if verify_schwab_live 40; then
    SCHWAB_LIVE=1
  else
    warn "Schwab data isn't flowing yet — running on delayed Yahoo for now."
    info "Common on first build: the schwab container is still initialising."
    info "Wait ~30s and refresh http://localhost:3000, or watch:"
    info "  ( cd mern && docker compose logs -f schwab server )"
    info "Your token is still valid; no sign-in is needed."
  fi
else
  step "5. Data source"
  ok "Running on Yahoo data (~15-min delayed)"
fi

# ─────────────────────── 6. Open the dashboard ─────────────────────
step "6. Opening the dashboard"
open_browser "$URL"

echo
echo "═══════════════════════════════════════════════════════════════"
if [ "$MODE" = "schwab" ] && [ "$SCHWAB_LIVE" = "1" ]; then
  echo "  ✓ Live — real-time Schwab data at $URL"
elif [ "$MODE" = "schwab" ]; then
  echo "  ! Dashboard open at $URL, but on delayed Yahoo fallback."
  echo "    Schwab issue: ${SCHWAB_LIVE_REASON:-unknown}"
  echo "    Details:  http://localhost:4000/api/diagnose?ticker=SPY"
else
  echo "  ✓ Dashboard open at $URL — free delayed Yahoo data."
  echo "    Re-run start.command and pick option 1 to switch to real-time Schwab."
fi
echo
echo "  To stop everything:  double-click  stop.command"
echo "═══════════════════════════════════════════════════════════════"
