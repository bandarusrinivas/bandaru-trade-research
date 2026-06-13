#!/usr/bin/env bash
# Install the Discord → WhatsApp notification watcher under Hammerspoon.
#
#   ./install.sh         set up ~/.hammerspoon/init.lua
#   ./install.sh status  show whether Hammerspoon is installed + running
#
# Assumes the parent bridge .env already has WHATSAPP_PHONE_ID / WHATSAPP_TOKEN
# / WHATSAPP_TO populated (we reuse it).

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$DIR/.." && pwd)"
HS_DIR="$HOME/.hammerspoon"
INIT_DST="$HS_DIR/init.lua"
INIT_SRC="$DIR/init.lua.template"

cmd="${1:-install}"

ensure_hammerspoon() {
  if [ -d "/Applications/Hammerspoon.app" ]; then
    echo "✅ Hammerspoon already installed"
    return
  fi
  if ! command -v brew >/dev/null 2>&1; then
    echo "❌ Homebrew not found. Install from https://brew.sh first, or download Hammerspoon manually from https://www.hammerspoon.org/" >&2
    exit 1
  fi
  echo "📦 Installing Hammerspoon via Homebrew…"
  brew install --cask hammerspoon
}

write_init() {
  mkdir -p "$HS_DIR"
  if [ -f "$INIT_DST" ] && ! grep -q "@@PROJECT_DIR@@\|notification-bridge/watcher.lua" "$INIT_DST"; then
    cp "$INIT_DST" "$INIT_DST.backup-$(date +%Y%m%d-%H%M%S)"
    echo "💾 Backed up existing init.lua to $INIT_DST.backup-*"
  fi
  sed "s|@@PROJECT_DIR@@|$PROJECT_DIR|g" "$INIT_SRC" > "$INIT_DST"
  echo "✅ Wrote $INIT_DST"
}

ensure_env() {
  if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "❌ Missing $PROJECT_DIR/.env  — fill in WHATSAPP_* first (copy from .env.example)." >&2
    exit 1
  fi
  if ! grep -q "^WHATSAPP_PHONE_ID=" "$PROJECT_DIR/.env" || \
     ! grep -q "^WHATSAPP_TOKEN=" "$PROJECT_DIR/.env" || \
     ! grep -q "^WHATSAPP_TO=" "$PROJECT_DIR/.env"; then
    echo "⚠️  .env exists but WHATSAPP_PHONE_ID / WHATSAPP_TOKEN / WHATSAPP_TO are not all set."
    echo "    The watcher will warn at runtime until they're filled in."
  fi
}

install_all() {
  ensure_env
  ensure_hammerspoon
  write_init
  echo
  echo "── Next steps (manual, one-time) ─────────────────────────────────────"
  echo " 1. Open Hammerspoon.app (it'll show in the menu bar with a Hand icon)."
  echo " 2. Click the menu-bar icon → Preferences →"
  echo "      ✓ \"Launch Hammerspoon at login\""
  echo " 3. Grant Full Disk Access:"
  echo "      System Settings → Privacy & Security → Full Disk Access → +"
  echo "      Add /Applications/Hammerspoon.app and toggle it ON."
  echo " 4. Click the menu-bar icon → Reload Config."
  echo "      You should see a brief \"WA bridge loaded\" alert."
  echo " 5. Smoke test: press ⌘⌥⌃W (Cmd+Option+Control+W) — a test WhatsApp"
  echo "    message should arrive in seconds. If not, see Console.app or"
  echo "    Hammerspoon menu → Console."
  echo " 6. Enable native macOS notifications for Discord:"
  echo "      System Settings → Notifications → Discord → Allow Notifications ON,"
  echo "      Notification Style: Banners or Alerts (NOT \"None\")."
  echo "    Then in Discord itself, for each channel you want forwarded:"
  echo "      Right-click channel → Notification Settings → All Messages."
  echo "──────────────────────────────────────────────────────────────────────"
}

status() {
  if [ -d "/Applications/Hammerspoon.app" ]; then
    echo "Hammerspoon: installed"
  else
    echo "Hammerspoon: NOT installed"
  fi
  if pgrep -x Hammerspoon >/dev/null 2>&1; then
    echo "Hammerspoon process: running"
  else
    echo "Hammerspoon process: not running"
  fi
  if [ -f "$INIT_DST" ]; then
    echo "init.lua: $INIT_DST"
    if grep -q "$PROJECT_DIR" "$INIT_DST"; then
      echo "  → references this project"
    else
      echo "  → does NOT reference this project (re-run install.sh)"
    fi
  else
    echo "init.lua: not present"
  fi
  if [ -f "$HOME/.discord-wa-bridge/state.json" ]; then
    cat "$HOME/.discord-wa-bridge/state.json"
  else
    echo "state file: not yet created (first poll hasn't run)"
  fi
}

case "$cmd" in
  install) install_all ;;
  status)  status ;;
  *)
    echo "Usage: $0 {install|status}" >&2
    exit 1
    ;;
esac
