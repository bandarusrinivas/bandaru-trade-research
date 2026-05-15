# Deployment Guide

Where and how to run Bandaru Trade Research in production.

> **Just want to run it locally?** See [USER_GUIDE.md](USER_GUIDE.md).
> **Building the images?** See [BUILD.md](BUILD.md).

---

## Deployment options at a glance

| Target | Setup time | Monthly cost | Best for |
|---|---|---|---|
| **Self-hosted VPS** (Hetzner / DO / Linode) | 5 min | $4–6 | Personal, full control |
| **DigitalOcean App Platform** | 10 min | $5+ | Managed, auto-deploy from git |
| **Render** | 10 min | $7+ | Managed, simple UI |
| **Fly.io** | 15 min | Pay-as-you-go (~$2–5) | Edge deployment, multi-region |
| **Railway** | 10 min | Usage-based | Auto-detects compose |
| **AWS ECS Fargate** | 30 min | $15–30 | Production, AWS ecosystem |
| **Google Cloud Run** | 20 min | Pay-per-request (often $0) | Serverless, scales to zero |
| **Azure Container Apps** | 25 min | $0–25 | Azure ecosystem |
| **Kubernetes (any)** | 60 min | Varies | Enterprise, multi-region, multi-tenant |

Every option below works with the **same Docker images** built by the standard pipeline. No code changes needed.

---

## Universal prerequisites

Before deploying anywhere:

1. **Push your fork to GitHub** (if you haven't): `git push origin main`
2. **Tag a release** (optional but recommended): `git tag v2.0.0 && git push --tags`
   - This builds and publishes images to `ghcr.io/<your-user>/bandaru-trade-research-server:2.0.0` (and `-client`)
3. **Decide on a database**:
   - **Self-hosted Mongo** (in the same Docker network) — simplest, free
   - **MongoDB Atlas** (managed) — free 512 MB tier, recommended for production

---

## Option 1 — Self-hosted VPS (Hetzner / DigitalOcean / Linode)

The cheapest and most flexible option. Works on any Linux box that runs Docker.

### Pick a provider

| Provider | Plan | Specs | Cost |
|---|---|---|---|
| **Hetzner** CPX11 | 2 vCPU + 2 GB | Frankfurt/Helsinki/Ashburn | €4.51/mo |
| **DigitalOcean** Basic | 1 vCPU + 1 GB | NYC/SF/AMS/etc. | $6/mo |
| **Linode** Nanode | 1 vCPU + 1 GB | Multiple regions | $5/mo |
| **Oracle Cloud Free** | 4 vCPU + 24 GB ARM | ATL/PHX/etc. | $0 forever |

### Setup

```bash
# SSH into the VPS
ssh root@your-server-ip

# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh

# Clone the repo
git clone https://github.com/bandarusrinivas/bandaru-trade-research.git
cd bandaru-trade-research/mern

# Configure (optional)
cp .env.example .env
# Edit .env to add Schwab creds if desired

# Run in background
docker compose up -d
```

Open `http://<your-server-ip>:3000` in any browser.

### Production hardening

1. **Bind only to localhost + add HTTPS via Caddy** (free):

   ```bash
   # Install Caddy
   apt install caddy

   # Edit /etc/caddy/Caddyfile:
   bandaru.yourdomain.com {
     reverse_proxy localhost:3000
   }

   systemctl reload caddy
   ```

   Caddy auto-provisions TLS certificates from Let's Encrypt. Now `https://bandaru.yourdomain.com` works.

2. **Bind compose to localhost only** (so the world can't hit port 3000 directly). In `mern/docker-compose.yml`:

   ```yaml
   client:
     ports:
       - "127.0.0.1:3000:80"   # was "3000:80"
   ```

3. **Firewall**: `ufw allow 22,80,443/tcp && ufw enable`

4. **Auto-restart on reboot**: docker-compose services already have `restart: unless-stopped`. As long as Docker starts at boot (it does by default), the app comes back automatically.

---

## Option 2 — DigitalOcean App Platform

Managed PaaS — handles SSL, scaling, logs, auto-deploy from git.

1. Push your repo to GitHub (must be public OR you must connect DO to your GitHub account)
2. Sign in at https://cloud.digitalocean.com/apps
3. Click **Create App** → **GitHub** → select your fork
4. DO auto-detects `mern/docker-compose.yml`. Confirm.
5. For the `mongo` service, add a **persistent volume** (DO calls it a "volume") for `/data/db`
6. Click **Launch**. ~5 minutes later, you get an `https://your-app.ondigitalocean.app` URL.

**Cost**: starts at $5/month per container. The 3-service stack runs around $15–20/month including a managed database.

**Auto-deploy**: every push to `main` triggers a rebuild and rolling restart.

---

## Option 3 — Render

Similar to DO App Platform.

1. Sign up at https://render.com
2. **New** → **Web Service** → connect GitHub → select repo
3. Render reads `mern/docker-compose.yml` automatically. Confirm.
4. Add a **Render PostgreSQL** instance OR use MongoDB Atlas (see below) — Render doesn't host Mongo natively. Switch `mongo` service in compose to use Atlas URI.
5. Deploy. ~5 minutes.

**Cost**: $7/month per Web Service. With Atlas free tier and 2 services (server + client), total ~$14/month.

---

## Option 4 — Fly.io

Globally-distributed, edge-deployment. Free tier is generous.

1. Install the CLI: `curl -L https://fly.io/install.sh | sh`
2. `fly auth login`
3. From repo root:
   ```bash
   cd mern/server && fly launch     # creates fly.toml interactively
   cd ../client && fly launch
   ```
4. For MongoDB: easiest is MongoDB Atlas (see below). Or `fly mongodb create` to spin one up inside Fly.
5. Set secrets: `fly secrets set DATA_SOURCE=yahoo MONGO_URI=mongodb+srv://...`
6. `fly deploy` (per service).

**Cost**: pay-per-second. A small instance running 24/7 costs ~$2–5/month. Multi-region adds linearly.

---

## Option 5 — AWS ECS Fargate (or EKS)

Production-grade, AWS-native. Steeper learning curve but lots of integration.

### Quick path with AWS Copilot

```bash
# Install Copilot CLI
brew install aws/tap/copilot-cli

# From the repo
cd mern
copilot init
# Follow prompts: app name "bandaru", service type "Load Balanced Web Service"

copilot deploy
```

Copilot reads `docker-compose.yml`, generates CloudFormation, builds and pushes images to ECR, provisions ALB + Fargate tasks.

### Mongo

For ECS, use **DocumentDB** (AWS's MongoDB-compatible managed service, $0.0277/hr ≈ $20/month) or **MongoDB Atlas** (cheaper at small scale).

**Cost**: ~$25–60/month for 1 vCPU / 1 GB Fargate task + ALB + DocumentDB.

---

## Option 6 — Google Cloud Run

Serverless, scales to zero. Best for low-traffic personal dashboards.

```bash
# Build + push to Artifact Registry
gcloud builds submit mern/server --tag us-central1-docker.pkg.dev/PROJECT/repo/server
gcloud builds submit mern/client --tag us-central1-docker.pkg.dev/PROJECT/repo/client

# Deploy
gcloud run deploy bandaru-server \
  --image us-central1-docker.pkg.dev/PROJECT/repo/server \
  --port 4000 \
  --set-env-vars MONGO_URI=mongodb+srv://...

gcloud run deploy bandaru-client \
  --image us-central1-docker.pkg.dev/PROJECT/repo/client \
  --port 80
```

Cloud Run **scales to zero** when idle. If only you use the dashboard, it usually costs **$0/month** under the free tier.

For Mongo: use **MongoDB Atlas** (free) — Cloud Run doesn't host stateful services well.

---

## Option 7 — Kubernetes (any cluster)

```bash
# Convert docker-compose to Kubernetes manifests
kompose convert -f mern/docker-compose.yml -o k8s/

# Apply
kubectl apply -f k8s/
```

This generates Deployments + Services + PersistentVolumeClaims. For production, you'll want to:

- Replace the local PVC with a managed storage class (EBS / GCE PD / Azure Disk)
- Add an Ingress + cert-manager for HTTPS
- Use a managed Mongo (Atlas / DocumentDB) instead of in-cluster

---

## MongoDB Atlas (managed open source)

For any cloud option above, MongoDB Atlas's free tier (512 MB cluster, M0) is the simplest persistence option.

1. Sign up at https://www.mongodb.com/cloud/atlas/register
2. Create a free M0 cluster (no credit card needed)
3. Whitelist your container's egress IP (or use `0.0.0.0/0` for development)
4. Copy the connection string: `mongodb+srv://user:pass@cluster.mongodb.net/bandaru`
5. Set it as `MONGO_URI` in your deployment env vars
6. Remove the `mongo` service from `docker-compose.yml` (or comment it out)

**Free tier handles**: ~10,000 trade-journal entries comfortably. Upgrade ($9/mo) when you outgrow it.

---

## Environment variables (deployment reference)

Every cloud deployment supports setting env vars. The full list:

| Var | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | yes | `mongodb://mongo:27017/bandaru` | MongoDB connection string |
| `PORT` | no | `4000` | Express listen port |
| `DATA_SOURCE` | no | `yahoo` | `yahoo` or `schwab` (Schwab stubbed) |
| `SCHWAB_API_KEY` | when DATA_SOURCE=schwab | — | Schwab developer-portal app key |
| `SCHWAB_APP_SECRET` | when DATA_SOURCE=schwab | — | Schwab developer-portal app secret |
| `SCHWAB_CALLBACK_URL` | no | `https://127.0.0.1` | Schwab OAuth callback |

In production, **store secrets in your cloud's secret manager**, not in `.env` files committed to git:

- AWS: Secrets Manager / Parameter Store
- GCP: Secret Manager
- Azure: Key Vault
- DigitalOcean: App-level encrypted env vars
- Fly.io: `fly secrets set`
- Render: dashboard env vars

---

## CORS, HTTPS, custom domains

The nginx container in `mern/client/` proxies `/api/*` → `server:4000` on the same origin, so **CORS is not needed** in production.

For HTTPS, **let the platform handle it**:

- DO App Platform / Render / Fly / Cloud Run / Azure: automatic TLS via the platform
- Self-hosted: Caddy or Traefik in front, both auto-provision from Let's Encrypt
- Kubernetes: cert-manager + an Ingress controller

For custom domains: configure a CNAME or A record pointing to your deployment's hostname. Most platforms handle the rest.

---

## Health checks

The `server` container exposes `GET /api/version` which returns 200 + JSON. All major platforms can poll this for health.

The `client` container is just static files served by nginx — a GET to `/` returns the SPA HTML. Health checks at `/` succeed when nginx is up.

---

## Monitoring + logs

Every container writes to stdout. Standard cloud platforms aggregate logs automatically. For self-hosted:

```bash
# Tail logs
docker compose logs -f --tail=200 server

# Pipe to a log aggregator (Loki / Datadog / Papertrail)
docker compose logs -f --no-color | your-log-shipper
```

For metrics: add a Prometheus exporter container if you need detailed observability. Out of scope for this guide.

---

## Scaling

Bandaru is a **stateless web app** in front of MongoDB. To scale:

- **Horizontal**: run multiple `server` replicas behind a load balancer. The server keeps no in-memory state — all mutable data lives in Mongo.
- **Vertical**: increase the CPU/RAM of the single instance. The app's ceiling is yfinance rate limits, not CPU.
- **Geographic**: deploy to multiple regions (Fly.io makes this trivial) with a global load balancer (Cloudflare, Fastly).

A single 1-vCPU / 1-GB instance handles **~50 concurrent users** comfortably (limited by yfinance throttling, not Node performance).

---

## Cost summary (typical small-scale)

| Setup | Monthly cost |
|---|---|
| Oracle Cloud Free Tier + Atlas Free | **$0** |
| Hetzner CPX11 + Atlas Free | **~$5** |
| DigitalOcean Droplet + self-hosted Mongo | **$6** |
| Fly.io minimal + Atlas Free | **~$2–5** |
| GCP Cloud Run + Atlas Free | **$0 if low-traffic** |
| DO App Platform + Atlas M0 | **~$15** |
| AWS Fargate + DocumentDB | **~$30–50** |

---

*Last updated: v2.0.0 · See [CHANGELOG.md](CHANGELOG.md) for version history.*
