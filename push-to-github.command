#!/usr/bin/env bash
# Bandaru Trade Research — Push to GitHub (self-healing version)
# Cleans stale git state, initializes fresh, commits, creates repo, pushes.

set +e   # Don't bail on individual command failures — we recover.
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd -P)"

GH_USER="bandarusrinivas"
REPO_NAME="bandaru-trade-research"
COMMIT_MSG="${1:-Initial commit — Bandaru Trade Research}"

echo ""
echo "================================================"
echo "  Push to GitHub — $GH_USER/$REPO_NAME"
echo "================================================"
echo ""

# ---- 1. Verify .gitignore covers secrets ------------------------------------
if [ ! -f .gitignore ] || ! grep -qE '^\.env$' .gitignore || ! grep -qE '^schwab_token' .gitignore; then
    echo "✗ .gitignore is missing entries for .env or schwab_token.json"
    echo "  Add them before pushing."
    read -p "Press Enter to close…"
    exit 1
fi
echo "✓ .gitignore properly excludes .env and schwab_token.json"

# ---- 2. Aggressively clean up any stale git state ---------------------------
if [ -d .git ]; then
    echo "→ Found existing .git/ — cleaning stale lock files…"
    rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/main.lock 2>/dev/null

    # If still problematic, nuke and restart fresh
    if ! git status >/dev/null 2>&1; then
        echo "→ .git/ is corrupted. Recreating…"
        rm -rf .git
    fi
fi

if [ ! -d .git ]; then
    echo "→ git init"
    git init -q
    git branch -M main
fi

# Configure git identity if missing
if [ -z "$(git config user.email)" ]; then
    git config user.email "${GH_USER}@users.noreply.github.com"
fi
if [ -z "$(git config user.name)" ]; then
    git config user.name "Srinivas Bandaru"
fi

# ---- 3. Stage all files (gitignore filters secrets) -------------------------
echo "→ git add -A"
git add -A
STAGED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
echo "✓ $STAGED_COUNT files staged"

# Belt-and-braces: ensure .env / token are NOT staged
if git diff --cached --name-only | grep -qE '^\.env$|^schwab_token\.json$'; then
    echo "✗ SECRET FILE IS STAGED — aborting!"
    git diff --cached --name-only | grep -E '^\.env$|^schwab_token\.json$'
    read -p "Press Enter to close…"
    exit 1
fi
echo "✓ Confirmed no secrets in staged files"

# ---- 4. Commit (if anything new to commit) ----------------------------------
if git diff --cached --quiet; then
    if [ -z "$(git rev-parse --verify HEAD 2>/dev/null)" ]; then
        echo "✗ Nothing to commit and no prior commit exists. Aborting."
        read -p "Press Enter to close…"
        exit 1
    fi
    echo "→ No new changes since last commit."
else
    git commit -q -m "$COMMIT_MSG"
    echo "✓ Committed: $COMMIT_MSG"
fi

# ---- 5. Install gh CLI if missing -------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
    echo ""
    echo "→ GitHub CLI (gh) is not installed."
    echo "  Attempting Homebrew install…"
    if command -v brew >/dev/null 2>&1; then
        brew install gh
    else
        echo ""
        echo "✗ Homebrew is not installed either."
        echo ""
        echo "Pick one:"
        echo "  (a) Install Homebrew + gh:"
        echo "      /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo "      brew install gh"
        echo ""
        echo "  (b) Push manually with a Personal Access Token:"
        echo "      1. Create a token at https://github.com/settings/tokens (scope: repo)"
        echo "      2. Create the repo at https://github.com/new (name: $REPO_NAME)"
        echo "      3. From this folder, run:"
        echo "         git remote add origin https://github.com/$GH_USER/$REPO_NAME.git"
        echo "         git push -u origin main"
        echo "         (when prompted for password, paste the token)"
        echo ""
        read -p "Press Enter to close…"
        exit 1
    fi
fi

# ---- 6. Authenticate gh CLI if needed (browser flow) ------------------------
if ! gh auth status >/dev/null 2>&1; then
    echo ""
    echo "→ Authenticating GitHub CLI via your browser…"
    echo "  A code will appear below. Paste it on the github.com page that opens."
    echo ""
    gh auth login --hostname github.com --git-protocol https --web
    if ! gh auth status >/dev/null 2>&1; then
        echo "✗ gh auth failed. Re-run this script to try again."
        read -p "Press Enter to close…"
        exit 1
    fi
fi
echo "✓ GitHub CLI authenticated as: $(gh api user --jq .login 2>/dev/null)"

# ---- 7. Configure git to use gh for HTTPS push (so no PAT prompts) ----------
gh auth setup-git >/dev/null 2>&1

# ---- 8. Create the repo on GitHub (if it doesn't exist) ---------------------
REPO_URL="https://github.com/$GH_USER/$REPO_NAME"
if gh repo view "$GH_USER/$REPO_NAME" >/dev/null 2>&1; then
    echo "→ Repo $GH_USER/$REPO_NAME already exists on GitHub."
else
    echo "→ Creating GitHub repo $GH_USER/$REPO_NAME…"
    gh repo create "$GH_USER/$REPO_NAME" \
        --public \
        --description "SPY 0DTE options day-trading dashboard" \
        --homepage "$REPO_URL" \
        || { echo "✗ Failed to create repo."; read -p "Press Enter to close…"; exit 1; }
fi

# ---- 9. Wire up the remote (idempotent) -------------------------------------
if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "$REPO_URL.git"
else
    git remote set-url origin "$REPO_URL.git"
fi
echo "✓ Remote set to $REPO_URL.git"

# ---- 10. Push! --------------------------------------------------------------
echo ""
echo "→ Pushing to $REPO_URL …"
if git push -u origin main; then
    echo ""
    echo "================================================"
    echo "  ✓ PUSH COMPLETE!"
    echo "================================================"
    echo ""
    echo "Repo:     $REPO_URL"
    echo "Actions:  $REPO_URL/actions"
    echo ""
    ( sleep 1 && open "$REPO_URL" ) &
    echo "Opening in browser…"
else
    echo ""
    echo "✗ Push failed. Common fixes:"
    echo "  • Run: gh auth refresh"
    echo "  • Or push manually: git push -u origin main"
fi

echo ""
read -p "Press Enter to close this window…"
