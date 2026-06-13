#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Bandaru Trade Research — Schwab OAuth via the Docker sidecar
#
#  Use this when the normal auth-schwab.command stalls — that happens
#  when the project folder is in iCloud Drive and the host Python
#  environment (legacy-python/.venv) isn't fully downloaded, so the
#  schwab-py import hangs.
#
#  This script runs the SAME OAuth flow INSIDE the already-built
#  bandaru-schwab container, which has a complete, clean Python
#  environment baked into its image — no host venv, no iCloud.
#
#  The new token is written to legacy-python/schwab_token.json on the
#  host (the folder is volume-mounted into the container).
# ════════════════════════════════════════════════════════════════════
cd "$(dirname "$0")"

printf '\n\033[1;36m========================================\033[0m\n'
printf '\033[1;36m  Schwab OAuth — via Docker container\033[0m\n'
printf '\033[1;36m========================================\033[0m\n\n'

# ---- 1. The schwab sidecar container must be running -----------------
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker isn't installed or isn't on PATH."
  read -p "Press Return to close… " _ ; exit 1
fi
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^bandaru-schwab$'; then
  echo "✗ The 'bandaru-schwab' container isn't running."
  echo "  Run start.command first (it builds and starts the containers),"
  echo "  then run this script again."
  read -p "Press Return to close… " _ ; exit 1
fi
echo "✓ bandaru-schwab container is running"

# ---- 2. Copy (NOT move) any existing token to a backup so a failed OAuth
# ----    attempt doesn't leave you with no active token. start.command's
# ----    token-age check needs the file to still be there if OAuth fails.
echo "→ Snapshotting the existing token (non-destructive)…"
docker exec bandaru-schwab sh -c \
  'if [ -f /tokens/schwab_token.json ]; then \
     cp /tokens/schwab_token.json "/tokens/schwab_token.json.preauth-$(date +%Y%m%d-%H%M%S).bak"; \
     echo "  existing token snapshotted; original kept in place"; \
   else echo "  no existing token — clean start"; fi' || true

cat <<'EOF'

What's about to happen:
  1. A Schwab authorization URL is printed below.
  2. Copy it into a browser, sign in with your Schwab BROKERAGE account,
     and approve the "Bandaru Trade Research" app.
  3. Schwab redirects to  https://127.0.0.1/?code=…  — that page will look
     broken ("this site can't be reached"). THAT IS EXPECTED.
  4. Copy the ENTIRE address-bar URL from that broken page.
  5. Paste it back into THIS window when prompted, then press Return.
     (You have ~30 seconds, so have the browser ready.)

EOF
read -p "Press Return to begin the OAuth flow… " _

# ---- 3. Run the OAuth INSIDE the container (clean Python) ------------
RC=0
docker exec -it -w /app bandaru-schwab python -m src.schwab_setup || RC=$?

if [ "$RC" -ne 0 ]; then
  echo
  echo "✗ OAuth did not complete (exit code $RC). See the messages above."
  echo "  Most common cause: the redirect URL was pasted incomplete, or the"
  echo "  code expired (~30s limit). Re-run this script and move quickly."
  # The original token is still in place because we COPIED (not moved) the
  # backup at step 2 — so start.command will still find a usable token if
  # the previous one hasn't expired. No need to restore anything.
  echo
  echo "  Your previous token (if any) is still active. start.command will"
  echo "  pick it up as long as it's < 7 days old."
  read -p "Press Return to close… " _ ; exit 1
fi

# ---- 4. Restart the sidecar so it loads the fresh token -------------
echo
echo "→ Restarting the Schwab sidecar to load the new token…"
docker restart bandaru-schwab >/dev/null 2>&1 || true
sleep 5

echo
echo "✓ Done — token saved to legacy-python/schwab_token.json"
echo "  The dashboard should now show real-time Schwab data."
echo "  Verify:  http://localhost:4000/api/diagnose?ticker=SPY"
echo
read -p "Press Return to close… " _
