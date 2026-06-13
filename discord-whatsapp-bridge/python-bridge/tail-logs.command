#!/bin/bash
# Double-click me to tail the daemon's logs in a Terminal window.
exec tail -n 30 -f \
  "$HOME/trading/discord-bridge/logs/watcher.out.log" \
  "$HOME/trading/discord-bridge/logs/watcher.err.log"
