#!/usr/bin/env bash
# Bandaru Trade Research — single entry point (Mac).
# Shows a menu, then delegates to the right mode-specific launcher in scripts/mac/.

cd "$(dirname "$0")"
ROOT="$(pwd)"

clear
printf '\033[1;36m╔══════════════════════════════════════════════════════════════╗\033[0m\n'
printf '\033[1;36m║  Bandaru Trade Research — v%-34s ║\033[0m\n' "$(cat VERSION 2>/dev/null || echo dev)"
printf '\033[1;36m╚══════════════════════════════════════════════════════════════╝\033[0m\n\n'

cat <<'EOF'
  Pick a mode:

    1)  Docker            — Mongo + Express + nginx     (Yahoo data)
    2)  Docker + Schwab   — adds real-time data sidecar (requires token)
    3)  Local Node        — Express + Vite, no Docker   (Yahoo data)
    4)  Python (Schwab)   — legacy Flask app            (real-time, no Docker)

    q)  Quit

EOF

read -p "Choice: " choice
echo

case "$choice" in
  1) exec "$ROOT/scripts/mac/start-docker.command" ;;
  2) exec "$ROOT/scripts/mac/start-docker-schwab.command" ;;
  3) exec "$ROOT/scripts/mac/start-local.command" ;;
  4) exec "$ROOT/scripts/mac/start-schwab.command" ;;
  q|Q) echo "Bye."; exit 0 ;;
  *) echo "✗ Invalid choice. Run again and pick 1–4 or q."; exit 1 ;;
esac
