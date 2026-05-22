#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Bandaru Trade Research — START  (Mac)
#
#  The ONE command to launch everything. Just double-click it.
#    • Starts Docker checks
#    • Signs you in to Schwab automatically when the token is missing/expired
#    • Builds + starts all containers with real-time Schwab data
#    • Verifies live data is flowing (re-signs-in on the spot if rejected)
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
  # Give Docker up to 60s to come alive
  for _ in $(seq 1 30); do
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

# ─────────────────────── 2. Credentials ────────────────────────────
step "2. Checking Schwab credentials"
[ -f .env ] || { fail ".env is missing — your Schwab API keys live there."; exit 1; }
if ! grep -q '^SCHWAB_API_KEY=.\+' .env || ! grep -q '^SCHWAB_APP_SECRET=.\+' .env; then
  fail "SCHWAB_API_KEY / SCHWAB_APP_SECRET are missing from .env"
  exit 1
fi
ok "Schwab credentials present"

# ─────────────────────── 3. Sign in (auth) ─────────────────────────
# Runs OAuth automatically only when there is no token, or it has expired.
step "3. Checking your Schwab sign-in"
NEED_AUTH=0
if [ ! -f legacy-python/schwab_token.json ]; then
  warn "No Schwab token yet — first-time sign-in needed."
  NEED_AUTH=1
else
  TOKEN_RC=0
  schwab_token_check legacy-python/schwab_token.json || TOKEN_RC=$?
  if [ "$TOKEN_RC" -ge 2 ]; then
    warn "Your Schwab token has expired — signing in again."
    NEED_AUTH=1
  fi
fi
if [ "$NEED_AUTH" = "1" ]; then
  echo
  info "A browser will open for Schwab sign-in — follow the prompts in this"
  info "window. It takes about a minute."
  echo
  "$ROOT/auth-schwab.command" || {
    fail "Schwab sign-in didn't finish. Double-click start.command to try again."
    exit 1
  }
fi
ok "Schwab sign-in ready"

# ─────────────────────── 4. Launch ─────────────────────────────────
step "4. Starting all containers (Mongo + Schwab + Express + nginx)"
(
  cd mern
  docker compose --profile schwab down --remove-orphans >/dev/null 2>&1 || true
  docker compose \
    --env-file "$ROOT/.env" \
    -f docker-compose.yml \
    -f docker-compose.schwab.yml \
    --profile schwab \
    up -d --build --force-recreate 2>&1 | sed 's/^/  /'
)
ok "Containers started"

# ─────────────────────── 5. Wait for server ────────────────────────
step "5. Waiting for the dashboard to come online"
if wait_for_url "http://localhost:4000/api/version" 90; then
  ok "Server is up"
else
  warn "Server is slow to start — check:  ( cd mern && docker compose logs -f )"
fi

# ─────────────────────── 6. Verify Schwab data ─────────────────────
# If Schwab rejects the token, sign in again on the spot and re-check.
step "6. Checking real-time Schwab data"
SCHWAB_LIVE=0
if verify_schwab_live 40; then
  SCHWAB_LIVE=1
else
  case "$SCHWAB_LIVE_REASON" in
    *token*|*Token*|*auth*|*OAuth*|*expir*|*Expir*)
      echo
      warn "Schwab rejected the token — signing in again now."
      "$ROOT/auth-schwab.command" || warn "Sign-in didn't finish."
      step "6b. Re-checking with the new token"
      sleep 12
      if verify_schwab_live 40; then
        SCHWAB_LIVE=1
      fi ;;
  esac
fi

# ─────────────────────── 7. Open the dashboard ─────────────────────
step "7. Opening the dashboard"
open_browser "$URL"

echo
echo "═══════════════════════════════════════════════════════════════"
if [ "$SCHWAB_LIVE" = "1" ]; then
  echo "  ✓ Live — real-time Schwab data at $URL"
else
  echo "  ! The dashboard is open at $URL but on delayed Yahoo data."
  echo "    Schwab issue: ${SCHWAB_LIVE_REASON:-unknown}"
  echo "    Open http://localhost:4000/api/diagnose?ticker=SPY for details."
fi
echo
echo "  To stop everything:  double-click  stop.command"
echo "═══════════════════════════════════════════════════════════════"
