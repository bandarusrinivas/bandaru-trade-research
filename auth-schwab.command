#!/usr/bin/env bash
# Bandaru Trade Research — Schwab OAuth (Mac, interactive)
# Re-authorize against Schwab. Use this when your token is expired/broken
# or before the very first run. Writes legacy-python/schwab_token.json.

set -e
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"
LEGACY="$PROJECT_ROOT/legacy-python"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Schwab OAuth — interactive\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

# --- prerequisites ----------------------------------------------------------
if [ ! -d "$LEGACY" ]; then
  echo "✗ legacy-python/ folder is missing."
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ python3 not found. Install from https://www.python.org/downloads/"
  exit 1
fi

# --- .env -------------------------------------------------------------------
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo "✗ $PROJECT_ROOT/.env is missing. SCHWAB credentials live there."
  exit 1
fi
if [ ! -e "$LEGACY/.env" ]; then
  ln -sf "$PROJECT_ROOT/.env" "$LEGACY/.env"
fi
if ! grep -q '^SCHWAB_API_KEY=.\+' "$LEGACY/.env" || ! grep -q '^SCHWAB_APP_SECRET=.\+' "$LEGACY/.env"; then
  echo "✗ SCHWAB_API_KEY / SCHWAB_APP_SECRET missing from .env."
  exit 1
fi

# --- venv -------------------------------------------------------------------
cd "$LEGACY"
if [ ! -d ".venv" ]; then
  echo "→ Creating Python virtual environment (.venv)..."
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
if ! python -c "import schwab, dotenv" 2>/dev/null; then
  echo "→ Installing Python dependencies (one-time, ~1 min)..."
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
fi

# --- back up any existing token before overwriting --------------------------
if [ -f "schwab_token.json" ]; then
  BACKUP="schwab_token.json.bak-$(date +%Y%m%d-%H%M%S)"
  cp schwab_token.json "$BACKUP"
  echo "→ Existing token backed up to $BACKUP"
  echo "→ Removing old token so the manual flow runs fresh"
  rm -f schwab_token.json
fi

# --- run the manual OAuth flow ---------------------------------------------
cat <<'EOF'

What's about to happen:
  1. A browser will open to Schwab's login page (or you'll see a URL printed
     in this terminal — copy/paste it into a browser if it doesn't auto-open).
  2. Sign in with your Schwab BROKERAGE account (not developer).
  3. Approve the "Bandaru Trade Research" app on the consent screen.
  4. Schwab redirects to https://127.0.0.1/?code=…
     The browser page will look broken (cert error / "site can't be reached")
     — THAT IS EXPECTED.
  5. Copy the ENTIRE address bar URL from the broken page.
  6. Paste it back into THIS terminal when prompted, then press Return.
  7. schwab-py exchanges the code for tokens and writes schwab_token.json.

EOF

read -p "Press Return to begin OAuth flow… " _

# Run the interactive setup (uses client_from_manual_flow under the hood)
python -m src.schwab_setup

# Verify the token landed
if [ -f "schwab_token.json" ]; then
  echo
  echo "✓ Token saved to $LEGACY/schwab_token.json"
  echo "  Next: double-click start-schwab.command to launch the dashboard."
else
  echo
  echo "✗ OAuth completed but no token file was created."
  echo "  Check the output above for errors."
  exit 1
fi
