#!/usr/bin/env bash
# Bandaru Trade Research — Schwab launcher (Mac)
# Runs the legacy Python Flask app with the Schwab real-time data client.
# Trade Journal lives in browser localStorage; auth uses your existing
# schwab_token.json in legacy-python/.

set -e
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"
LEGACY="$PROJECT_ROOT/legacy-python"
URL="http://127.0.0.1:5000"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Bandaru Trade Research — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m  Mode: Schwab (legacy Python Flask)\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

# ---------------------------------------------------------------------------
# 1. Sanity checks
# ---------------------------------------------------------------------------
if [ ! -d "$LEGACY" ]; then
  echo "✗ legacy-python/ folder is missing. Did you delete it?"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ python3 not found. Install from https://www.python.org/downloads/"
  echo "  (or 'brew install python@3.11')"
  exit 1
fi
PY_VER=$(python3 -c "import sys;print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "→ python3 $PY_VER detected"

# ---------------------------------------------------------------------------
# 2. .env handling — legacy app expects .env in its own folder
# ---------------------------------------------------------------------------
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo "✗ $PROJECT_ROOT/.env is missing. SCHWAB credentials live there."
  exit 1
fi

if [ ! -e "$LEGACY/.env" ]; then
  echo "→ Linking .env into legacy-python/"
  ln -sf "$PROJECT_ROOT/.env" "$LEGACY/.env"
fi

# Verify creds are populated
if ! grep -q '^SCHWAB_API_KEY=.\+' "$LEGACY/.env" || ! grep -q '^SCHWAB_APP_SECRET=.\+' "$LEGACY/.env"; then
  echo "✗ SCHWAB_API_KEY / SCHWAB_APP_SECRET missing from .env."
  exit 1
fi

# Force DATA_SOURCE for this run regardless of .env (env var wins over .env)
export DATA_SOURCE=schwab

# ---------------------------------------------------------------------------
# 3. venv setup
# ---------------------------------------------------------------------------
cd "$LEGACY"
if [ ! -d ".venv" ]; then
  echo "→ Creating Python virtual environment (.venv)..."
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

# Install requirements if Flask isn't importable in the venv
if ! python -c "import flask, schwab, dotenv, pytz, yfinance" 2>/dev/null; then
  echo "→ Installing Python dependencies (first-time setup, ~1 min)..."
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
fi

# ---------------------------------------------------------------------------
# 4. Token check — auto-run OAuth if missing
# ---------------------------------------------------------------------------
if [ ! -f "schwab_token.json" ]; then
  echo
  echo "⚠ No Schwab token found. Running interactive OAuth setup first…"
  echo
  cat <<'EOF'
You'll be asked to:
  1. Sign in to Schwab in a browser
  2. Approve the app
  3. Copy the redirect URL (page will look broken — that's OK)
  4. Paste it back here when prompted
EOF
  echo
  read -p "Press Return to begin… " _
  python -m src.schwab_setup
  if [ ! -f "schwab_token.json" ]; then
    echo "✗ OAuth did not produce a token. Aborting."
    exit 1
  fi
  echo "✓ OAuth complete."
fi
echo "→ Schwab token present (created $(date -r schwab_token.json 2>/dev/null || stat -f %Sm schwab_token.json))"

# ---------------------------------------------------------------------------
# 5. Free port 5000
# ---------------------------------------------------------------------------
if lsof -ti:5000 >/dev/null 2>&1; then
  echo "→ Killing previous server on port 5000..."
  lsof -ti:5000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ---------------------------------------------------------------------------
# 6. Launch
# ---------------------------------------------------------------------------
echo
echo "→ Starting Flask on $URL"
echo "  (Press Ctrl+C in this window to stop, or use stop.command.)"
echo

# Open browser after a short delay
( sleep 3 && open "$URL" 2>/dev/null ) &

# Run Flask in the foreground — Ctrl+C kills it cleanly
exec python app.py
