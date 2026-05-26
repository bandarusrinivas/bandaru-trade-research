#!/usr/bin/env bash
# Bandaru Trade Research — package a source-protected release.
#
# Builds the prebuilt Docker images (server source is bundled + minified, the
# Python sidecar is compiled to bytecode) and bundles everything a recipient
# needs into a single shareable .zip. Recipients run the app from the images
# with `docker compose up` — no source code is included.
#
# Just double-click this file, or run it from a terminal.

set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/_shared.sh
source "scripts/_shared.sh"
resolve_root

banner "Package release — source-protected Docker artifact"

VERSION="$(tr -d ' \t\n\r' < VERSION 2>/dev/null || echo 0.0.0)"
[ -n "$VERSION" ] || VERSION="0.0.0"
OUT="release-dist"
STAGE="$OUT/bandaru-trade-research-$VERSION"
ARCHIVE="bandaru-images-$VERSION.tar.gz"

info "Version: $VERSION"

# ---- 1. Docker check ----
step "1. Checking Docker"
if ! docker_up; then
  fail "Docker isn't running. Start Docker Desktop, wait for it, then retry."
  echo; read -r -p "Press Return to close…" _ || true
  exit 1
fi
ok "Docker is running"

# ---- 2. Build the three images ----
step "2. Building images  (tag: $VERSION)"
info "• server  — Express API, source bundled + minified"
docker build -t "bandaru-server:$VERSION" --build-arg "APP_VERSION=$VERSION" mern/server
info "• client  — React UI, compiled by Vite, served by nginx"
docker build -t "bandaru-client:$VERSION" --build-arg VITE_API_BASE=/api mern/client
info "• schwab  — Schwab data sidecar, compiled to bytecode"
docker build -t "bandaru-schwab:$VERSION" legacy-python
ok "All three images built"

# ---- 3. Pull MongoDB so the bundle is fully offline ----
step "3. Fetching mongo:7  (bundled so recipients need no internet)"
docker pull mongo:7
ok "mongo:7 ready"

# ---- 4. Save the images into one archive ----
step "4. Saving images into a single archive"
rm -rf "$STAGE"
mkdir -p "$STAGE"
docker save \
    "bandaru-server:$VERSION" \
    "bandaru-client:$VERSION" \
    "bandaru-schwab:$VERSION" \
    "mongo:7" \
  | gzip > "$STAGE/$ARCHIVE"
ok "Saved $(du -h "$STAGE/$ARCHIVE" | cut -f1) — $STAGE/$ARCHIVE"

# ---- 5. Assemble the handoff bundle ----
step "5. Assembling the handoff bundle"
cp release/docker-compose.yml "$STAGE/docker-compose.yml"
cp release/.env.example       "$STAGE/.env.example"
cp release/README.md          "$STAGE/README.md"
ZIP="$OUT/bandaru-trade-research-$VERSION.zip"
rm -f "$ZIP"
( cd "$OUT" && zip -qr "bandaru-trade-research-$VERSION.zip" "bandaru-trade-research-$VERSION" )
ok "Bundle ready"

# ---- Done ----
banner "Done"
info "Share this single file with anyone who should run the app:"
echo
info "  $ROOT/$ZIP"
echo
info "It contains the prebuilt images + docker-compose.yml + README.md +"
info ".env.example — and NO source code. The recipient unzips it, runs"
info "'docker load' then 'docker compose up', and opens localhost:3000."
echo
read -r -p "Press Return to close…" _ || true
