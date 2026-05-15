# Contributing to Bandaru Trade Research

Thanks for thinking about contributing — every PR, bug report, and feature suggestion is welcome. This project is MIT-licensed and intentionally hackable.

---

## Quick start

```bash
# 1. Fork the repo on GitHub: https://github.com/bandarusrinivas/bandaru-trade-research
# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/bandaru-trade-research.git
cd bandaru-trade-research

# 3. Create a feature branch
git checkout -b my-feature

# 4. Make changes, test locally (see "Local development" below)

# 5. Commit + push
git add .
git commit -m "Brief description of the change"
git push origin my-feature

# 6. Open a Pull Request on GitHub
```

---

## Local development

Two ways to develop:

### A. Full Docker stack (matches production)

```bash
cd mern
docker compose up -d --build
docker compose logs -f         # tail logs
# Make code changes → `docker compose up -d --build` again
```

Slow feedback loop (~30s per change) but matches what runs in production.

### B. Hot reload (recommended for active development)

```bash
# Terminal 1 — MongoDB only
docker run -d --name bandaru-mongo -p 27017:27017 mongo:7

# Terminal 2 — Express with --watch reload on file change
cd mern/server
npm install
MONGO_URI=mongodb://localhost:27017/bandaru npm run dev

# Terminal 3 — React with Vite HMR
cd mern/client
npm install
npm run dev
# Open http://localhost:5173 (Vite proxies /api → localhost:4000)
```

Fast feedback (~50ms per JSX change, ~1s per server change).

**Prerequisites for option B**:
- Node.js 20 LTS — install via [nvm](https://github.com/nvm-sh/nvm), `brew install node@20`, or [nodejs.org](https://nodejs.org)
- Docker (for the Mongo container)

---

## Project layout

```
bandaru-trade-research/
├── mern/                            # ← The primary application
│   ├── docker-compose.yml
│   ├── server/                      # Express API
│   │   ├── server.js                # entry
│   │   ├── routes/                  # one file per /api/* endpoint
│   │   ├── services/                # indicators.js, yahoo.js, analysis.js
│   │   └── models/                  # Mongoose schemas
│   └── client/                      # React app
│       ├── vite.config.js
│       └── src/
│           ├── App.jsx
│           ├── api.js               # axios client
│           ├── chart/BandaruChart.js  # canvas chart
│           └── components/          # one file per tab
│
├── docs/                            # All Markdown docs (this file lives here)
├── legacy-python/                   # Old Flask implementation, kept for reference
├── README.md                        # Project overview
├── LICENSE                          # MIT
├── VERSION                          # Bump this to release
└── .github/workflows/build.yml      # CI: builds Docker images on push
```

Detailed architecture in [PRODUCT_GUIDE.md](PRODUCT_GUIDE.md).

---

## How to add a new feature

### Adding a new API endpoint

1. Create `mern/server/routes/myendpoint.js`:
   ```js
   import { Router } from "express";
   const router = Router();
   router.get("/", async (req, res) => { res.json({ hello: "world" }); });
   export default router;
   ```
2. Wire it in `mern/server/server.js`:
   ```js
   import myendpointRoute from "./routes/myendpoint.js";
   app.use("/api/myendpoint", myendpointRoute);
   ```
3. Add a client helper to `mern/client/src/api.js`:
   ```js
   export const getMyEndpoint = () => api.get("/myendpoint").then(r => r.data);
   ```
4. Use it in a component.

### Adding a new tab to the dashboard

1. Create `mern/client/src/components/MyTab.jsx`
2. Import it in `mern/client/src/App.jsx`
3. Add to the `TABS` array + render slot

### Adding a new indicator

The indicator math lives in `mern/server/services/indicators.js`. Add a pure function, export it, then call it from whichever route surfaces it (`analysis.js`, `screener.js`, etc.).

---

## Code style

The project intentionally uses **no linter / formatter** — keeps PRs focused on logic, not whitespace nitpicks. But please follow the existing style:

- **2-space indentation** in JS/JSX
- **ES modules** (`import`/`export`) — no CommonJS
- **Functional React components** (no class components)
- **Hooks** for state + effects (no Redux for now — keep state local)
- **No `any` types** in TypeScript (project is plain JS for now, but if you bring TS, keep it strict)
- **No emoji in code comments** unless the existing file already uses them

If you really want a linter, add it locally — just don't introduce sweeping reformat commits.

---

## Testing

The MERN stack doesn't yet have an automated test suite. PRs that add tests are very welcome — suggested stack:

- **Server**: `node --test` (built into Node 20) or Vitest
- **Client**: Vitest + React Testing Library
- **E2E**: Playwright

CI will pick them up automatically if you add a `test` script to `package.json`.

The legacy Python implementation has a 120-check pytest suite at `legacy-python/tests/test_all.py` — useful for reference when porting indicator math.

---

## Pull request checklist

Before opening a PR:

- [ ] Code compiles cleanly (`docker compose build` succeeds)
- [ ] `docker compose up` brings the stack up healthy
- [ ] `/api/version` still returns 200
- [ ] Manual smoke test of the changed feature in the browser
- [ ] No secrets in any committed file (`.env`, `schwab_token.json`, etc.)
- [ ] `.gitignore` updated if you added a new build artifact
- [ ] [CHANGELOG.md](CHANGELOG.md) entry under `## [Unreleased]`
- [ ] [README.md](../README.md) updated if user-facing behavior changed

For larger changes, please also:
- [ ] Update [PRODUCT_GUIDE.md](PRODUCT_GUIDE.md) describing the new feature
- [ ] Update [USER_GUIDE.md](USER_GUIDE.md) if the user-facing workflow changed
- [ ] Add a quick test (manual is fine if no test infra exists yet)

---

## Releasing a new version

Maintainers only:

```bash
# Bump version
echo "2.1.0" > VERSION

# Edit CHANGELOG.md — move items from [Unreleased] into a new [2.1.0] section
$EDITOR docs/CHANGELOG.md

# Commit + tag
git add VERSION docs/CHANGELOG.md
git commit -m "Release v2.1.0"
git tag v2.1.0
git push origin main --tags
```

GitHub Actions then:
1. Builds + pushes Docker images to `ghcr.io/bandarusrinivas/bandaru-trade-research-{server,client}:2.1.0`
2. Creates a Release on the GitHub Releases page with auto-generated notes

See [BUILD.md](BUILD.md) for details.

---

## License

This project is **MIT-licensed**. By contributing, you agree your contribution will be released under MIT.

You retain copyright of your contributions. The codebase is open to commercial use, modification, redistribution, and sublicensing — see [LICENSE](../LICENSE).

For dependency licenses, see [mern/NOTICE.md](../mern/NOTICE.md).

---

## Reporting bugs

Open an issue at https://github.com/bandarusrinivas/bandaru-trade-research/issues with:

1. **What you expected**
2. **What actually happened**
3. **How to reproduce** (commands, browser, OS)
4. **Logs** (`docker compose logs server` output is gold)

---

## Questions

Tag issues with `question` for general questions, or check existing discussions first.

---

*Thanks for contributing!*
