#!/usr/bin/env bash
# Runs the discord-whatsapp-bridge until BRIDGE_STOP_TIME (in BRIDGE_TZ), then
# terminates it. Invoked by launchd at start time on weekdays.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Make sure node is findable regardless of which shell loaded the env.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_DIR="$DIR/logs"
mkdir -p "$LOG_DIR"

PID_FILE="$DIR/.bridge.pid"
LOG_FILE="$LOG_DIR/bridge.log"

STOP_TIME="${BRIDGE_STOP_TIME:-15:00}"   # 24h HH:MM
TZ_NAME="${BRIDGE_TZ:-America/Chicago}"  # timezone for the schedule

stamp() { date "+%Y-%m-%d %H:%M:%S %Z"; }
log()   { echo "[runner $(stamp)] $*" | tee -a "$LOG_FILE" >&2; }

# Refuse to run on weekends (defense in depth — launchd already filters).
weekday_in_tz=$(TZ="$TZ_NAME" date +%u)  # 1=Mon ... 7=Sun
if [ "$weekday_in_tz" -ge 6 ]; then
  log "weekend in $TZ_NAME (dow=$weekday_in_tz) — skipping"
  exit 0
fi

# Refuse a stale pid file (previous run left a node alive).
if [ -f "$PID_FILE" ]; then
  old_pid=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "${old_pid:-}" ] && kill -0 "$old_pid" 2>/dev/null; then
    log "bot already running (pid=$old_pid) — exiting"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# Compute today's stop time, in $TZ_NAME, as a unix epoch.
today_in_tz=$(TZ="$TZ_NAME" date +%Y-%m-%d)
stop_epoch=$(TZ="$TZ_NAME" date -j -f "%Y-%m-%d %H:%M" "$today_in_tz $STOP_TIME" +%s 2>/dev/null || true)
now_epoch=$(date +%s)

if [ -z "$stop_epoch" ]; then
  log "could not parse stop time '$STOP_TIME' in $TZ_NAME"
  exit 1
fi

if [ "$stop_epoch" -le "$now_epoch" ]; then
  log "stop time $STOP_TIME $TZ_NAME already passed — exiting"
  exit 0
fi

duration=$((stop_epoch - now_epoch))
log "starting bot — will run for ${duration}s (until $STOP_TIME $TZ_NAME)"

# Launch the bot.
node index.js >> "$LOG_FILE" 2>&1 &
BOT_PID=$!
echo "$BOT_PID" > "$PID_FILE"
log "node pid=$BOT_PID"

cleanup() {
  if kill -0 "$BOT_PID" 2>/dev/null; then
    log "sending SIGTERM to pid $BOT_PID"
    kill -TERM "$BOT_PID" 2>/dev/null || true
    # Give it 10s to flush, then SIGKILL if still alive.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$BOT_PID" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$BOT_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}
trap cleanup EXIT INT TERM

# Sleep until stop time, polling so we notice early node death.
while [ "$(date +%s)" -lt "$stop_epoch" ]; do
  if ! kill -0 "$BOT_PID" 2>/dev/null; then
    log "node exited early — runner exiting"
    exit 0
  fi
  remaining=$((stop_epoch - $(date +%s)))
  [ "$remaining" -le 0 ] && break
  if [ "$remaining" -gt 60 ]; then sleep 60; else sleep "$remaining"; fi
done

log "stop time reached"
