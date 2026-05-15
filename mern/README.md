# Bandaru Trade Research — MERN + Docker

Open-source, fully portable rewrite of the platform on the **MERN** stack:

- **M**ongoDB 7 (SSPL — open source) — persistent Trade Journal
- **E**xpress 4 (MIT) — REST API with the indicator + analysis logic ported from Python
- **R**eact 18 + Vite (MIT) — single-page dashboard
- **N**ode.js 20 LTS (MIT) — runtime

Wrapped in **Docker Compose** so it runs identically on macOS, Windows, and Linux — `docker compose up` is all you need.

---

## One-command setup (everything portable)

```bash
cd mern
cp .env.example .env       # optional: edit to add Schwab creds (default uses Yahoo)
docker compose up          # foreground (Ctrl+C to stop)
```

Then open **http://localhost:3000** in any browser.

That's it. No Python, no Node, no MongoDB needed on the host — Docker handles every prerequisite.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser (http://localhost:3000)                     │
│  ↓                                                   │
│  nginx (client container)                            │
│  - serves React static build                         │
│  - proxies /api/* → server:4000                      │
└──────────────────┬───────────────────────────────────┘
                   │ docker network
                   ▼
┌──────────────────────────────────────────────────────┐
│  Express (server container, Node 20)                 │
│  - /api/version  /api/analysis  /api/candles         │
│  - /api/chain    /api/watchlist /api/screener        │
│  - /api/trades   (MongoDB-backed Trade Journal)      │
│  - Yahoo Finance via yahoo-finance2 npm package      │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  MongoDB (mongo container)                           │
│  - Trade Journal collection                          │
│  - Persistent volume (mongo-data)                    │
└──────────────────────────────────────────────────────┘
```

---

## Stack & licenses (all open source)

| Component | Version | License | Source |
|---|---|---|---|
| Node.js | 20 LTS | MIT | https://nodejs.org/ |
| Express | 4 | MIT | https://github.com/expressjs/express |
| Mongoose | 8 | MIT | https://github.com/Automattic/mongoose |
| yahoo-finance2 | 2 | MIT | https://github.com/gadicc/node-yahoo-finance2 |
| React | 18 | MIT | https://github.com/facebook/react |
| Vite | 5 | MIT | https://github.com/vitejs/vite |
| Axios | 1 | MIT | https://github.com/axios/axios |
| MongoDB | 7 | SSPL v1 | https://www.mongodb.com/licensing/server-side-public-license |
| nginx | latest | 2-clause BSD | https://nginx.org/LICENSE |
| Alpine Linux base | latest | MIT-style | https://alpinelinux.org/ |

See [NOTICE.md](NOTICE.md) for full attribution.

---

## What's implemented vs TODO

### ✓ Working in the MERN scaffold

- **Backend**: all 7 endpoints (`/api/version`, `/api/analysis`, `/api/candles`, `/api/chain`, `/api/watchlist`, `/api/screener`, `/api/trades`)
- **Indicators ported**: SMA, EMA, RSI, MACD, ATR, ADX (Wilder), Bollinger Bands, TTM Squeeze, pivot points
- **Recommendation engine**: Bull Call Break + Bear Put Break setups
- **Stock screener**: 11 opportunity classifications, parallel scan, sorted by score
- **Trade Journal**: MongoDB-backed (vs localStorage in Python) — survives container restarts
- **React frontend**: 4 tabs (Chart / Alerts / Screener / Journal), header with ticker picker + master verdict
- **Auto-refresh**: 10s polling on the dashboard
- **Docker**: 3-service compose with healthchecks + persistent volume

### ⚠ TODO (currently markers in code)

- **Schwab API**: only stubbed — there's no mature Node SDK like Python's schwab-py. To enable Schwab real-time, write a REST wrapper in `server/services/schwab.js` that handles OAuth + signs requests. Yahoo Finance works out of the box.
- **Chart panes**: Only price + pivots are drawn. MACD / TTM / Volume sub-panes are TODO — port from `static/js/chart.js` in the Python project.
- **Day partitions / 3D view**: Not yet implemented in the React chart component.
- **Options Chain tab**: Backend endpoint exists, no UI yet.
- **Pro Signals tab**: Not yet wired (math is ported, just needs the React UI).
- **Heikin-Ashi / Smooth HA**: Not yet ported to the React chart.

---

## Development (without Docker)

If you want to hack on the code with live reload:

```bash
# Terminal 1 — MongoDB
docker run -d --name bandaru-mongo -p 27017:27017 -v bandaru-mongo:/data/db mongo:7

# Terminal 2 — Express server
cd mern/server
npm install
MONGO_URI=mongodb://localhost:27017/bandaru npm run dev

# Terminal 3 — React with Vite hot reload
cd mern/client
npm install
npm run dev
# → http://localhost:5173 (proxies /api → localhost:4000)
```

---

## Production deployment

The `docker-compose.yml` is production-suitable for single-host deploys. For larger scale:

- **Multi-host**: switch to Docker Swarm or Kubernetes — the same images work
- **HTTPS**: put a Caddy or Traefik reverse proxy in front
- **MongoDB Atlas**: replace the `mongo` service with `MONGO_URI=mongodb+srv://...` env var
- **Schwab credentials**: store in Docker secrets, not `.env`

---

## Environment variables

| Var | Default | Description |
|---|---|---|
| `DATA_SOURCE` | `yahoo` | `yahoo` or `schwab` (Schwab is stubbed) |
| `MONGO_URI` | `mongodb://mongo:27017/bandaru` | MongoDB connection string |
| `PORT` | `4000` | Express listen port (inside container) |
| `SCHWAB_API_KEY` | empty | App key for Schwab REST (when implemented) |
| `SCHWAB_APP_SECRET` | empty | App secret for Schwab REST |
| `SCHWAB_CALLBACK_URL` | `https://127.0.0.1` | OAuth callback |

---

## File structure

```
mern/
├── docker-compose.yml          # Orchestrates mongo + server + client
├── README.md                    # This file
├── NOTICE.md                    # Open-source license attribution
├── .env.example                 # Template for credentials
│
├── server/                      # Express backend
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js                # Entry: routes, mongoose, cors, morgan
│   ├── routes/                  # 7 endpoint files
│   ├── services/                # indicators.js, yahoo.js, analysis.js
│   └── models/Trade.js          # Mongoose schema for Trade Journal
│
└── client/                      # React + Vite frontend
    ├── Dockerfile               # Multi-stage: Node build → nginx serve
    ├── nginx.conf               # Proxies /api → server
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx              # 4 tabs + auto-refresh
        ├── api.js               # Axios client
        ├── styles.css
        └── components/
            ├── Header.jsx
            ├── ChartAnalysis.jsx
            ├── EntryExitAlerts.jsx
            ├── Screener.jsx
            └── TradeJournal.jsx
```

---

## Migration path from the Python version

The Python version (root of repo) and the MERN version (`mern/` subfolder) **share zero code** — they're parallel implementations. The Python version is feature-complete; this MERN version is a scaffold meant to grow into feature parity.

**To incrementally close the gap**:

1. Port Smooth Heikin-Ashi and the MACD/TTM/Volume sub-panes from `static/js/chart.js` into `client/src/components/ChartAnalysis.jsx`
2. Write `server/services/schwab.js` REST wrapper for Schwab API (OAuth + signed quotes/chain calls)
3. Port the Pro Signals daily indicators view (`pro_indicators.py` math is already in `server/services/indicators.js`)
4. Wire the Options Chain table — backend already returns the data via `/api/chain`

---

*Open source · MIT · No warranty · Educational use only · Not financial advice*
