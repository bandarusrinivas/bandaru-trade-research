#!/usr/bin/env bash
# Bandaru Trade Research — Schwab launcher (Mac, legacy Python Flask, no Docker)

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
LEGACY="$ROOT/legacy-python"
URL="http://127.0.0.1:5000"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Bandaru Trade Research — v%s\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m  Mode: Schwab (legacy Python Flask)\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

[ -d "$LEGACY" ] || { echo "✗ legacy-python/ missing."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "✗ python3 not found."; exit 1; }
[ -f "$ROOT/.env" ] || { echo "✗ $ROOT/.env missing."; exit 1; }
[ -e "$LEGACY/.env" ] || ln -sf "$ROOT/.env" "$LEGACY/.env"
grep -q '^SCHWAB_API_KEY=.\+' "$LEGACY/.env" || { echo "✗ SCHWAB_API_KEY missing"; exit 1; }
grep -q '^SCHWAB_APP_SECRET=.\+' "$LEGACY/.env" || { echo "✗ SCHWAB_APP_SECRET missing"; exit 1; }

export DATA_SOURCE=schwab

cd "$LEGACY"
[ -d ".venv" ] || { echo "→ Creating venv..."; python3 -m venv .venv; }
# shellcheck disable=SC1091
source .venv/bin/activate
if ! python -c "import flask, schwab, dotenv, pytz, yfinance" 2>/dev/null; then
  echo "→ Installing Python dependencies (~1 min)..."
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
fi

if [ ! -f "schwab_token.json" ]; then
  echo
  echo "⚠ No Schwab token. Running interactive OAuth setup first…"
  echo
  read -p "Press Return to begin… " _
  python -m src.schwab_setup
  [ -f "schwab_token.json" ] || { echo "✗ OAuth did not produce a token."; exit 1; }
fi
echo "→ Schwab token present"

if lsof -ti:5000 >/dev/null 2>&1; then
  echo "→ Freeing port 5000..."
  lsof -ti:5000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo
echo "→ Starting Flask on $URL (Ctrl+C to stop)"
( sleep 3 && open "$URL" 2>/dev/null ) &
exec python app.py
