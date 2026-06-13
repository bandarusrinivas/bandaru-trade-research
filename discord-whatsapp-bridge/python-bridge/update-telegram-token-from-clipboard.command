#!/bin/bash
# Reads the new Telegram bot token from clipboard and updates
# the live daemon's .env at ~/trading/discord-bridge/.env.
# The watcher picks up the new value on the next 5-second poll.

ENV="$HOME/trading/discord-bridge/.env"

if [ ! -f "$ENV" ]; then
  echo "❌ Not found: $ENV"
  read -p "Press Return to close..."
  exit 1
fi

NEW=$(pbpaste | tr -d '[:space:]')

# Sanity check: Telegram tokens look like <digits>:<base64ish>
if ! [[ "$NEW" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
  echo "❌ Clipboard doesn't look like a Telegram token:"
  echo "   '${NEW:0:20}...' (length ${#NEW})"
  echo
  echo "Copy the token from BotFather first (triple-click the token text,"
  echo "then Cmd+C), then double-click this script again."
  read -p "Press Return to close..."
  exit 1
fi

# Backup, then in-place replace the TELEGRAM_BOT_TOKEN line.
cp -p "$ENV" "$ENV.backup-$(date +%Y%m%d-%H%M%S)"
/usr/bin/sed -i '' "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$NEW|" "$ENV"

echo "✅ Updated TELEGRAM_BOT_TOKEN in $ENV"
echo "   token length: ${#NEW} chars"
echo "   The watcher reads .env on each poll, so the new token takes effect within 5s."
echo
echo "── verification ──"
grep "^TELEGRAM_BOT_TOKEN=" "$ENV" | sed 's/=.*$/=<set>/'
grep "^TELEGRAM_CHAT_ID=" "$ENV" | sed 's/=.*$/=<set>/'
echo
read -p "Press Return to close..."
