#!/usr/bin/env bash
# Double-click this in Finder to install the SPY 0DTE shell snippet into:
#   ~/.bashrc          (always)
#   ~/.bash_profile    (so login shells / Terminal.app pick it up)
#   ~/.zshrc           (optional — the default shell on modern macOS)
#
# It also stamps SPY_DTE_DIR with the absolute path of this project folder,
# so commands like `spy-run` work from anywhere.
#
# Safe to run multiple times: the block is delimited with BEGIN/END markers
# and is replaced (not duplicated) on re-run.

set -e
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd -P)"
TEMPLATE="$PROJECT_DIR/bashrc.template"

if [ ! -f "$TEMPLATE" ]; then
    echo "ERROR: bashrc.template not found next to this script."
    read -p "Press Enter to close…"
    exit 1
fi

BEGIN_MARK="# ===== BEGIN: SPY 0DTE Analyzer block ====="
END_MARK="# ===== END: SPY 0DTE Analyzer block ====="

# Render the template with the actual project path
TMP_BLOCK="$(mktemp)"
sed "s|__SPY_DTE_DIR__|$PROJECT_DIR|" "$TEMPLATE" > "$TMP_BLOCK"

install_into() {
    local FILE="$1"
    echo ""
    echo "→ $FILE"
    # Create file if missing
    touch "$FILE"
    # Back it up once per install
    cp "$FILE" "$FILE.bak.spy"
    # Remove any prior block between markers
    if grep -qF "$BEGIN_MARK" "$FILE"; then
        # awk: skip lines from BEGIN to END inclusive
        awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
            $0 ~ b {skip=1}
            !skip {print}
            $0 ~ e {skip=0; next}
        ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
        echo "  Replaced existing SPY 0DTE block."
    else
        echo "  Appending SPY 0DTE block."
    fi
    # Add a leading newline only if file isn't empty and doesn't end in one
    if [ -s "$FILE" ] && [ "$(tail -c1 "$FILE")" != "" ]; then
        printf '\n' >> "$FILE"
    fi
    cat "$TMP_BLOCK" >> "$FILE"
}

# Ensure ~/.bash_profile sources ~/.bashrc (Mac convention)
ensure_bashrc_sourced() {
    local PROFILE="$HOME/.bash_profile"
    touch "$PROFILE"
    if ! grep -qF "[ -f \"\$HOME/.bashrc\" ] && source \"\$HOME/.bashrc\"" "$PROFILE"; then
        {
            echo ""
            echo "# Source .bashrc for interactive login shells (Mac convention)"
            echo "[ -f \"\$HOME/.bashrc\" ] && source \"\$HOME/.bashrc\""
        } >> "$PROFILE"
        echo "  → ~/.bash_profile now sources ~/.bashrc"
    fi
}

echo "================================================"
echo "  Installing shell snippet for SPY 0DTE Analyzer"
echo "================================================"
echo ""
echo "Project: $PROJECT_DIR"
echo ""
echo "This will edit your shell startup files and back them up to *.bak.spy"
echo ""
read -p "Continue? [Y/n] " ANS
ANS=${ANS:-Y}
if [[ ! "$ANS" =~ ^[Yy] ]]; then
    echo "Aborted."
    read -p "Press Enter to close…"
    exit 0
fi

# bash files
install_into "$HOME/.bashrc"
install_into "$HOME/.bash_profile"
ensure_bashrc_sourced

# zsh (default shell on macOS Catalina+)
read -p $'\nAlso install into ~/.zshrc (recommended on modern macOS)? [Y/n] ' ZANS
ZANS=${ZANS:-Y}
if [[ "$ZANS" =~ ^[Yy] ]]; then
    install_into "$HOME/.zshrc"
fi

rm -f "$TMP_BLOCK"

echo ""
echo "================================================"
echo "  Done."
echo "================================================"
echo ""
echo "Open a NEW Terminal window (or run 'source ~/.bashrc' / 'source ~/.zshrc')"
echo "to pick up the changes. Then try:"
echo ""
echo "    spy-shell    # cd to the project + activate venv"
echo "    spy-auth     # one-time Schwab OAuth"
echo "    spy-run      # start the dashboard"
echo ""
read -p "Press Enter to close…"
