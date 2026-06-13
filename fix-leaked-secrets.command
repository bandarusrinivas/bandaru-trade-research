#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  Bandaru Trade Research — leaked-secret remediation (v2)
#
#  WHAT THIS HANDLES
#  ─────────────────
#  Three .env.backup-* files under discord-whatsapp-bridge/ contain a real
#  Discord bot token. They have been staged into multiple unpushed
#  commits because push-to-github.command does `git add -A` on every
#  run, picking the files back up from the working tree.
#
#  THE FIX
#  ───────
#    1. Delete the .env.backup-* files from disk (so re-running
#       push-to-github.command stops re-introducing them).
#    2. git reset --soft origin/main — undoes ALL unpushed commits while
#       keeping every other change in the working tree.
#    3. Make a single new commit WITHOUT the .env.backup-* files.
#    4. Push.
#    5. Token rotation reminder (Discord requires manual reset on
#       https://discord.com/developers/applications).
#
#  Safe to re-run. Each step is idempotent.
# ════════════════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

# Color helpers
B='\033[1;36m'; G='\033[1;32m'; Y='\033[1;33m'; R='\033[1;31m'; D='\033[1;90m'; N='\033[0m'

step() { printf "\n${B}▸ %s${N}\n" "$1"; }
ok()   { printf "  ${G}✓${N} %s\n" "$1"; }
warn() { printf "  ${Y}!${N} %s\n" "$1"; }
err()  { printf "  ${R}✗${N} %s\n" "$1"; }
dim()  { printf "  ${D}%s${N}\n" "$1"; }

printf "\n${B}═════════════════════════════════════════════════════════════${N}\n"
printf "${B}  Leaked-Secret Remediation (v2 — handles multiple commits)${N}\n"
printf "${B}═════════════════════════════════════════════════════════════${N}\n"

# ─── 1. Verify project root ────────────────────────────────────────────
step "1. Verifying project root"
if [ ! -d ".git" ] || [ ! -d "discord-whatsapp-bridge" ]; then
  err "This doesn't look like the project root."
  err "Expected to find .git/ and discord-whatsapp-bridge/ here:"
  err "  $(pwd)"
  read -p "Press Return to close… " _
  exit 1
fi
ok "In $(pwd)"

# ─── 2. Inspect unpushed commits ───────────────────────────────────────
step "2. Inspecting unpushed commits"
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
if [ "$AHEAD" = "0" ]; then
  warn "No unpushed commits found. Nothing to repair."
  warn "If GitHub is still rejecting, the bad commit may be on a different"
  warn "branch — run 'git log --all --oneline' to inspect."
  read -p "Press Return to close… " _
  exit 0
fi
ok "$AHEAD unpushed commit(s) — will reset --soft to origin/main"
dim "Commits about to be undone (keeping their changes in working tree):"
git log --oneline origin/main..HEAD | sed 's/^/    /'

# ─── 3. Token-rotation reminder ────────────────────────────────────────
step "3. ⚠  CRITICAL — Discord token rotation"
printf "${Y}  The token in the .env.backup files was visible to GitHub's\n"
printf "${Y}  secret-scanning system. Treat it as compromised:\n${N}\n"
printf "    1. Open https://discord.com/developers/applications\n"
printf "    2. Pick your bot's app → Bot → Reset Token → confirm\n"
printf "    3. Paste the new token into discord-whatsapp-bridge/.env\n"
printf "       (replace the DISCORD_TOKEN= line)\n"
printf "    4. Restart the bridge if it was running.\n\n"
printf "${D}  (This script can't rotate the token for you — Discord requires\n"
printf "${D}   manual confirmation on their site.)\n${N}\n"

read -p "  Have you rotated the token? Or are you OK proceeding anyway? [y/N] " ROTATED
ROTATED=${ROTATED:-N}
if [ "$ROTATED" != "y" ] && [ "$ROTATED" != "Y" ]; then
  warn "Stopped. Rotate the token first, then re-run this script."
  read -p "Press Return to close… " _
  exit 0
fi

# ─── 4. Delete leaked backup files from disk ───────────────────────────
step "4. Deleting leaked backup files from disk"
deleted=0
for f in discord-whatsapp-bridge/.env.backup-* \
         discord-whatsapp-bridge/.env.bak-*; do
  [ -e "$f" ] || continue
  rm -f "$f"
  ok "removed $f"
  deleted=$((deleted+1))
done
# Sandbox leftover (created when I tested filesystem write earlier)
if [ -f "_test_write" ]; then
  rm -f _test_write
  ok "removed _test_write (sandbox leftover)"
  deleted=$((deleted+1))
fi
if [ "$deleted" = "0" ]; then
  dim "Nothing to delete — files already gone from disk."
fi

# ─── 5. Soft-reset to origin/main ──────────────────────────────────────
step "5. Soft-resetting to origin/main"
dim "This undoes the $AHEAD unpushed commit(s) but keeps all changes in your"
dim "working tree, so we can build a single clean commit next."
git reset --soft origin/main
ok "HEAD now at $(git rev-parse --short HEAD) ($(git log -1 --format=%s))"

# ─── 6. Verify nothing dangerous is staged ────────────────────────────
step "6. Sanity-checking what's about to be committed"
# `git add -A` will pick up the deletions for the .env.backup-* files
# (since they're now tracked-by-the-index but missing-from-disk) plus
# every other file change since origin/main.
git add -A
DANGER=$(git diff --cached --name-only --diff-filter=AM | \
         grep -E '(^|/)\.env$|\.env\.backup-|\.env\.bak|schwab_token\.json$|schwab_token\.json\.bak' || true)
if [ -n "$DANGER" ]; then
  err "REFUSING TO COMMIT — these files look like secrets that are being ADDED or MODIFIED:"
  echo "$DANGER" | sed 's/^/    /'
  err ""
  err "If any of those are intentional, run 'git restore --staged <file>' on each"
  err "and re-run this script. Otherwise delete them and re-run."
  read -p "Press Return to close… " _
  exit 1
fi
ok "No secret-looking files in the additions/modifications"

# Show user the deletion + the real changes
NDEL=$(git diff --cached --name-only --diff-filter=D | wc -l | tr -d ' ')
NADD=$(git diff --cached --name-only --diff-filter=AM | wc -l | tr -d ' ')
dim "$NDEL file(s) will be deleted from the repo, $NADD file(s) added/modified."
if [ "$NADD" -gt 0 ] && [ "$NADD" -le 20 ]; then
  dim "Adds / modifies (first 20):"
  git diff --cached --name-only --diff-filter=AM | head -20 | sed 's/^/    /'
fi

# ─── 7. Commit ─────────────────────────────────────────────────────────
step "7. Creating the clean commit"
MSG="Windows installer, chart upgrades, docs — leaked .env.backup-* removed

Bundles the three previously-rejected commits into one clean commit
that excludes the discord-whatsapp-bridge/.env.backup-* files that
GitHub push-protection flagged.

Adds .gitignore patterns for .env.backup-*, .env.bak-*, .env.preauth-*,
schwab_token.json.preauth-* and _test_write so this can't recur."
git commit -m "$MSG"
ok "New commit: $(git rev-parse --short HEAD)"

# Last sanity check before push: does the new commit contain anything
# matching the dangerous patterns?
LEFTOVER=$(git show --name-only HEAD | grep -E '\.env\.backup-|\.env\.bak|^\.env$' || true)
if [ -n "$LEFTOVER" ]; then
  err "New commit STILL contains files matching the secret pattern:"
  echo "$LEFTOVER" | sed 's/^/    /'
  err "Bail out and inspect manually before pushing."
  read -p "Press Return to close… " _
  exit 1
fi
ok "New commit verified clean"

# ─── 8. Push ───────────────────────────────────────────────────────────
step "8. Pushing to GitHub"
echo
read -p "  Push origin main now? [Y/n] " GO
GO=${GO:-Y}
if [ "$GO" != "y" ] && [ "$GO" != "Y" ]; then
  warn "Skipped push. Run 'git push origin main' yourself when ready."
  read -p "Press Return to close… " _
  exit 0
fi

if git push origin main; then
  printf "\n${G}═════════════════════════════════════════════════════════════${N}\n"
  printf "${G}  ✓ Push succeeded. Repository is clean.${N}\n"
  printf "${G}═════════════════════════════════════════════════════════════${N}\n"
  echo
  printf "${D}  GitHub's secret-scanning will no longer reject pushes for\n"
  printf "${D}  this token because no commit in the new history contains it.${N}\n"
  echo
  if [ "$ROTATED" != "y" ] && [ "$ROTATED" != "Y" ]; then
    printf "${Y}  REMINDER:${N} rotate the Discord bot token NOW if you haven't.\n"
    printf "    https://discord.com/developers/applications\n\n"
  fi
else
  printf "\n${R}═════════════════════════════════════════════════════════════${N}\n"
  printf "${R}  ✗ Push failed. See output above.${N}\n"
  printf "${R}═════════════════════════════════════════════════════════════${N}\n"
  echo
  err "If the rejection is STILL about the Discord token, run:"
  err "    git log --all --oneline -- discord-whatsapp-bridge/.env.backup-\\*"
  err "to find any other branch or stash that still contains the files."
fi

read -p "Press Return to close… " _
