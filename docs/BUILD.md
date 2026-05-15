# Building Bandaru Trade Research

How to build the Docker images locally, understand the CI pipeline, and publish images for distribution.

> **Just want to run the app?** See [USER_GUIDE.md](USER_GUIDE.md).
> **Deploying to a cloud?** See [DEPLOY.md](DEPLOY.md).

---

## What gets built

The project ships as **two Docker images**:

| Image | Base | Purpose | Approx size |
|---|---|---|---|
| `bandaru-trade-research-server` | `node:20-alpine` | Express API on port 4000 | ~180 MB |
| `bandaru-trade-research-client` | `node:20-alpine` (build) → `nginx:alpine` (runtime) | React SPA served by nginx on port 80 | ~50 MB |

A third image (`mongo:7`) is pulled from Docker Hub — not built locally.

All three are orchestrated by `mern/docker-compose.yml`.

---

## Local build

### Build everything (server + client)

```bash
cd bandaru-trade-research/mern
docker compose build
```

First build takes 2–4 minutes (downloads base images, installs npm packages). Subsequent builds use layer cache and complete in ~10 seconds for code-only changes.

### Build a single image

```bash
docker compose build server      # rebuild server image only
docker compose build client      # rebuild client image only
docker compose build --no-cache  # force fresh build (no cache)
```

### Build and start in one shot

```bash
docker compose up -d --build
```

### Build without docker-compose (raw `docker build`)

```bash
docker build -t bandaru-server mern/server/
docker build -t bandaru-client mern/client/
```

---

## How the Dockerfiles work

### `mern/server/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev             # production-only install (deterministic via package-lock)
COPY . .
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q -O- http://localhost:4000/api/version || exit 1
CMD ["node", "server.js"]
```

Key points:
- Single-stage — the production image keeps node_modules + source
- `npm ci` (not `npm install`) — uses package-lock for reproducibility
- `--omit=dev` skips dev dependencies (no test runners, no linters)
- Built-in healthcheck — `docker-compose` waits for `/api/version` to respond before reporting the container ready

### `mern/client/Dockerfile`

```dockerfile
# Stage 1: Build the React app with Vite
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build                 # → dist/

# Stage 2: Serve static files with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Key points:
- Multi-stage build — the final image is tiny (~50 MB) because node_modules and source are discarded after build
- nginx serves static SPA files and proxies `/api/*` → `server:4000` (see `nginx.conf`)
- All API calls go through nginx, so CORS isn't needed in production

---

## GitHub Actions CI/CD

`.github/workflows/build.yml` runs on every push and pull request. Three jobs:

### 1. Build matrix (`build`)

Builds both Docker images in parallel:
- Uses `docker/build-push-action@v5` with BuildKit cache (`type=gha`) for fast rebuilds
- Tags images automatically via `docker/metadata-action@v5`:
  - `main` branch → `latest`
  - Pull requests → `pr-N`
  - Version tags (`v2.0.0`) → `2.0.0`, `2.0`, `latest`
- On `v*` tags, pushes images to **GitHub Container Registry (ghcr.io)**

### 2. Compose smoke test (`compose-up`)

After both images build, this job:
1. Validates `mern/docker-compose.yml` syntax (`docker compose config --quiet`)
2. Runs `docker compose up -d --build`
3. Waits for the `server` healthcheck to pass
4. Hits `http://localhost:4000/api/version` to confirm the API responds
5. Tears down with `docker compose down -v`

If this job fails, the build is broken and no images get published.

### 3. Release (`release`) — only on `v*` tags

When you push a tag like `v2.0.1`:
1. Builds and pushes images to `ghcr.io/bandarusrinivas/bandaru-trade-research-server:2.0.1`
2. Creates a GitHub Release at `/releases/tag/v2.0.1`
3. Auto-generates release notes from commits since the previous tag
4. Includes pull-and-run instructions in the release body

---

## Publishing a new version

Three steps to ship a release:

```bash
# 1. Bump VERSION
echo "2.0.1" > VERSION

# 2. Update CHANGELOG.md with a new section
# (manual — add ### Added / ### Changed / ### Fixed lines under a new ## [2.0.1] heading)

# 3. Commit + tag + push
git add VERSION docs/CHANGELOG.md
git commit -m "Release v2.0.1"
git tag v2.0.1
git push origin main --tags
```

The CI pipeline takes over from there:
- ~3 min: both images built + tested
- ~30s: images pushed to ghcr.io
- ~5s: GitHub Release created

End users update with:

```bash
git pull
cd mern && docker compose up -d --build
```

Or if you want them to pull the **prebuilt** images instead of building locally, edit `mern/docker-compose.yml`:

```yaml
server:
  image: ghcr.io/bandarusrinivas/bandaru-trade-research-server:latest
  # remove: build: ./server

client:
  image: ghcr.io/bandarusrinivas/bandaru-trade-research-client:latest
  # remove: build: ./client
```

Now `docker compose up` skips the build step and pulls finished images — ~10 second startup.

---

## Versioning — Semantic Versioning (semver)

`MAJOR.MINOR.PATCH` per [semver.org](https://semver.org):

- **MAJOR** — breaking changes (API removed, env-var format change, data-shape change)
- **MINOR** — backwards-compatible new features (new tab, new endpoint, new indicator)
- **PATCH** — bug fixes only

Current version lives in the `VERSION` file at the project root. The Express server reads it at startup and exposes it via `/api/version`. The React footer displays it as a chip.

The legacy Python tooling read the same file. Either stack stays in sync on version.

---

## Build prerequisites

To build locally you need:

| Tool | Version | Required for |
|---|---|---|
| **Docker** | 20.10+ | Building images, running compose |
| **Docker Compose v2** | 2.0+ | Bundled with Docker Desktop |
| **git** | any | Cloning the repo |

That's it. **You don't need Node, npm, Python, MongoDB, or any other tooling installed on the host** — everything runs inside containers.

---

## Sizing + performance

| Resource | Idle | Active (1 user) | Notes |
|---|---|---|---|
| **Disk** | 350 MB | 350 MB | Mongo data grows ~1 KB per trade-journal entry |
| **RAM** | ~250 MB | ~350 MB | mongo (~80) + server (~120) + client (~50) + nginx overhead |
| **CPU** | <1% | 2–8% | Spikes during 10s auto-refresh + screener scans |
| **Network** | ~20 KB/s | ~50 KB/s | Yahoo Finance API + browser polling |

Runs comfortably on a **1 vCPU / 1 GB RAM** cloud instance (cheapest tier of every major cloud).

---

## Troubleshooting builds

| Symptom | Cause | Fix |
|---|---|---|
| `npm ci` fails: lockfile mismatch | `package.json` changed without regenerating `package-lock.json` | `cd mern/server && rm -rf node_modules package-lock.json && npm install`, commit the new lock |
| Vite build fails: missing dep | Same as above for `mern/client` | Same fix in `mern/client/` |
| `nginx: [emerg] host not found in upstream "server"` | Server container failed to start | `docker compose logs server` to debug |
| Cache stale, old code in image | BuildKit cache holding old layers | `docker compose build --no-cache` |
| ghcr.io push fails: 403 | Workflow missing `packages: write` permission | Already configured in `.github/workflows/build.yml`; check repo Settings → Actions → Workflow permissions → "Read and write" |

---

## Building the legacy Python desktop binaries

If you need single-binary distributables (`.app` / `.exe`) for end users without Docker, see `legacy-python/README.md`. That path uses PyInstaller and produces native bundles for macOS and Windows.

---

*Last updated: v2.0.0 · See [CHANGELOG.md](CHANGELOG.md) for version history.*
