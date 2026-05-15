#!/usr/bin/env bash
# install-bandaru-cli — symlink the `bandaru` script into ~/bin so it's
# available from any directory as just: bandaru start | stop | exit | status

set -e
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd -P)"
SCRIPT="$PROJECT_DIR/bandaru"

if [ ! -x "$SCRIPT" ]; then
    echo "ERROR: $SCRIPT is missing or not executable."
    exit 1
fi

BIN_DIR="$HOME/bin"
mkdir -p "$BIN_DIR"

ln -sf "$SCRIPT" "$BIN_DIR/bandaru"

echo "================================================"
echo "  bandaru CLI installed"
echo "================================================"
echo ""
echo "  $BIN_DIR/bandaru  →  $SCRIPT"
echo ""

# Check if ~/bin is already in PATH; if not, append to ~/.zshrc and ~/.bash_profile
PATH_HAS_BIN=0
case ":$PATH:" in
    *":$BIN_DIR:"*) PATH_HAS_BIN=1 ;;
esac

if [ "$PATH_HAS_BIN" -eq 1 ]; then
    echo "✓ ~/bin is already in your PATH. Try it now:"
    echo ""
    echo "    bandaru status"
    echo ""
else
    echo "→ Adding ~/bin to your PATH in shell profile files…"
    PATH_LINE='export PATH="$HOME/bin:$PATH"  # added by Bandaru installer'
    for rc in "$HOME/.zshrc" "$HOME/.bash_profile"; do
        if [ ! -f "$rc" ]; then
            echo "$PATH_LINE" > "$rc"
            echo "  Created $rc with PATH entry"
        elif ! grep -q "Bandaru installer" "$rc" 2>/dev/null; then
            echo "" >> "$rc"
            echo "$PATH_LINE" >> "$rc"
            echo "  Appended to $rc"
        else
            echo "  $rc already has the entry"
        fi
    done
    echo ""
    echo "✓ Done. Open a NEW Terminal window (or run: source ~/.zshrc), then try:"
    echo ""
    echo "    bandaru status"
    echo ""
fi

echo "Available subcommands:"
echo "    bandaru start            # launch dashboard"
echo "    bandaru stop             # stop server"
echo "    bandaru exit             # full cleanup"
echo "    bandaru status           # show state"
echo "    bandaru auth             # re-run Schwab OAuth"
echo "    bandaru help             # full help"
echo ""
read -p "Press Enter to close this window…"
