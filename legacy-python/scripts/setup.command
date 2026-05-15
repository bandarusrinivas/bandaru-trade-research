#!/usr/bin/env bash
# Double-click this file (in Finder) to install Python (if needed),
# create a virtual environment, install dependencies, and prepare .env.

set -e
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd -P)"

echo "================================================"
echo "  Bandaru Trade Research — One-Click Setup"
echo "================================================"
echo ""
echo "Project directory: $PROJECT_DIR"
echo ""

# --- 0. Verify the rest of the project is here ------------------------------
REQUIRED=(requirements.txt app.py analysis.py schwab_client.py .env.example)
MISSING=()
for f in "${REQUIRED[@]}"; do
    [ -f "$f" ] || MISSING+=("$f")
done
if [ ${#MISSING[@]} -gt 0 ]; then
    echo "ERROR: setup.command is not sitting next to the rest of the project."
    echo "Missing from $PROJECT_DIR :"
    for f in "${MISSING[@]}"; do
        echo "  - $f"
    done
    echo ""
    echo "Fix it by either:"
    echo "  (a) moving setup.command back into the spy-zero-dte folder, OR"
    echo "  (b) moving the WHOLE spy-zero-dte folder to a clean location"
    echo "      (e.g. ~/Documents/spy-zero-dte) and double-clicking from there."
    echo ""
    read -p "Press Enter to close…"
    exit 1
fi

NEED_INSTALL=0

# --- 1. Python detection -----------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
    PYVER=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    PMAJOR=$(echo "$PYVER" | cut -d. -f1)
    PMINOR=$(echo "$PYVER" | cut -d. -f2)
    echo "Detected Python $PYVER at: $(command -v python3)"
    if [ "$PMAJOR" -lt 3 ] || ([ "$PMAJOR" -eq 3 ] && [ "$PMINOR" -lt 10 ]); then
        echo "Python 3.10+ is required (you have $PYVER)."
        NEED_INSTALL=1
    fi
else
    echo "Python 3 not found on this Mac."
    NEED_INSTALL=1
fi

# --- 2. Install Python via Homebrew if needed --------------------------------
if [ "$NEED_INSTALL" = "1" ]; then
    echo ""
    echo "Installing Python 3.12 via Homebrew..."
    if ! command -v brew >/dev/null 2>&1; then
        echo "Homebrew not found. Installing it first."
        echo "You'll be prompted for your Mac password (sudo)."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [ -d "/opt/homebrew/bin" ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -d "/usr/local/bin" ]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    fi
    brew install python@3.12
    PYBIN="$(brew --prefix)/bin/python3"
else
    PYBIN="$(command -v python3)"
fi

echo ""
echo "Using Python: $PYBIN"
"$PYBIN" --version

# --- 3. Create / refresh the virtual environment -----------------------------
if [ ! -d ".venv" ]; then
    echo ""
    echo "Creating virtual environment at .venv …"
    "$PYBIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

# --- 4. Install Python packages ---------------------------------------------
echo ""
echo "Installing dependencies (this may take a minute)…"
python -m pip install --upgrade pip
pip install -r requirements.txt

# --- 5. Prepare .env --------------------------------------------------------
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo "Created .env from .env.example."
fi

echo ""
echo "================================================"
echo "  Setup complete!"
echo "================================================"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Open .env in this folder and paste your Schwab"
echo "     APP KEY and SECRET (from https://developer.schwab.com)."
echo ""
echo "  2. Double-click  run-auth.command   (one-time OAuth)."
echo ""
echo "  3. Double-click  run-app.command   to start the dashboard,"
echo "     then open http://localhost:5000 in your browser."
echo ""
echo "Opening .env in your default text editor…"
sleep 1
open -t .env 2>/dev/null || open .env

echo ""
read -p "Press Enter to close this window…"
