#!/usr/bin/env bash
# Build the Bandaru Trade Analysis Platform as a macOS .app bundle.
# Output: dist/Bandaru Trade Analysis.app
# Double-click that .app to launch — no Python install required on the target Mac.

set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "ERROR: Virtual environment missing. Run setup.command first."
    read -p "Press Enter to close…"
    exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "================================================"
echo "  Building Bandaru Trade Analysis — macOS"
echo "================================================"

echo "→ Installing PyInstaller (if needed)…"
pip install -q --upgrade pyinstaller

echo "→ Cleaning previous builds…"
rm -rf build dist

echo "→ Running PyInstaller (this may take 2–5 minutes)…"
pyinstaller bandaru.spec --noconfirm

echo ""
echo "================================================"
echo "  Build complete!"
echo "================================================"
echo ""
echo "Output:"
echo "  dist/Bandaru Trade Analysis.app    ← double-click to run"
echo "  dist/Bandaru Trade Analysis/       ← folder version (cross-platform)"
echo ""
echo "To distribute:"
echo "  1. Right-click 'Bandaru Trade Analysis.app' → Compress"
echo "  2. Share the resulting .zip with anyone on macOS"
echo "  3. They double-click to run — no Python needed!"
echo ""
echo "Optional — create a .dmg disk image:"
echo "  cd dist && hdiutil create -srcfolder 'Bandaru Trade Analysis.app' \\"
echo "    -volname 'Bandaru Trade Analysis' BandaruTradeAnalysis.dmg"
echo ""
read -p "Press Enter to close…"
