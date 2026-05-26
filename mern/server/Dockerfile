# Bandaru Trade Research — Express API (source-protected production image).
#
# Multi-stage build:
#   Stage 1 (builder) bundles the ENTIRE server — server.js + routes/ +
#   services/ + models/ — into ONE minified file with esbuild. Third-party
#   packages stay external; they're public npm modules, not our source.
#   Stage 2 (runtime) is the shipped image: it contains only the minified
#   bundle and the production node_modules. None of the original .js source
#   files are included, so the image can be distributed without the source.

# ---------- Stage 1: bundle + minify ----------
FROM node:20-alpine AS builder
WORKDIR /build

COPY package*.json ./
RUN npm ci
# esbuild is a build-only tool — installed without touching package.json.
RUN npm install --no-save esbuild@^0.25.0

COPY . .
# Bundle all first-party source into a single minified file. --packages=external
# leaves `import express ...` etc. untouched (resolved from node_modules at run).
RUN node_modules/.bin/esbuild server.js \
      --bundle --platform=node --format=esm --target=node20 \
      --packages=external --minify --legal-comments=none \
      --outfile=dist/server.js

# Drop esbuild (extraneous) so only the runtime dependencies remain.
RUN npm prune --omit=dev

# ---------- Stage 2: runtime (no source) ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Stamp the version so /api/version can report it (no source tree here).
ARG APP_VERSION=2.2.0
RUN echo "$APP_VERSION" > VERSION

# Only the minified bundle + third-party deps + package.json ("type":"module").
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist/server.js ./server.js
COPY --from=builder /build/package.json ./package.json

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q -O- http://localhost:4000/api/version || exit 1

CMD ["node", "server.js"]
