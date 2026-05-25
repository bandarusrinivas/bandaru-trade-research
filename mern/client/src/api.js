// Axios client for the Express backend. In dev: proxied by Vite to localhost:4000.
// In Docker: nginx proxies /api → server:4000.
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "/api",
  timeout: 30000,
});

export const getVersion   = ()              => api.get("/version").then((r) => r.data);
export const getAnalysis  = (ticker)        => api.get("/analysis",  { params: { ticker } }).then((r) => r.data);
export const getCandles   = (ticker, p)     => api.get("/candles",   { params: { ticker, ...p } }).then((r) => r.data);
export const getChain     = (ticker)        => api.get("/chain",     { params: { ticker } }).then((r) => r.data);
export const getWatchlist = (symbols)       => api.get("/watchlist", { params: { symbols: symbols?.join(",") } }).then((r) => r.data);
// Screener scans dozens of symbols server-side — give it a generous timeout
// so a cold first scan (no cache yet) isn't cut off mid-flight.
export const getScreener  = (symbols, timeframe) => api.get("/screener", { params: { symbols: symbols?.join(","), timeframe }, timeout: 90000 }).then((r) => r.data);
export const getProfile   = (ticker)        => api.get("/profile",   { params: { ticker } }).then((r) => r.data);
export const getOptionDecay = (params)      => api.get("/option-decay", { params }).then((r) => r.data);
export const getGamma     = (ticker)        => api.get("/gamma",     { params: { ticker } }).then((r) => r.data);
export const getGexDashboard = (ticker)     => api.get("/gex-dashboard", { params: { ticker }, timeout: 45000 }).then((r) => r.data);
export const getPivotStops = (ticker)       => api.get("/pivot-stops", { params: { ticker } }).then((r) => r.data);
export const getOIFlow    = (ticker)        => api.get("/oi-flow",   { params: { ticker } }).then((r) => r.data);
export const getBacktest  = (params) =>
  api.get("/backtest", { params, timeout: 60000 }).then((r) => r.data);
export const getPremarket = (symbols)       =>
  api.get("/premarket", { params: { symbols: symbols?.join(",") }, timeout: 120000 }).then((r) => r.data);
export const getNews      = (scope)          =>
  api.get("/news", { params: { scope }, timeout: 90000 }).then((r) => r.data);
export const getAlerts    = ()               =>
  api.get("/alerts", { timeout: 30000 }).then((r) => r.data);

export const listTrades   = (status)        => api.get("/trades",    { params: { status } }).then((r) => r.data);
export const createTrade  = (body)          => api.post("/trades", body).then((r) => r.data);
export const updateTrade  = (id, body)      => api.patch(`/trades/${id}`, body).then((r) => r.data);
export const deleteTrade  = (id)            => api.delete(`/trades/${id}`).then((r) => r.data);

export default api;
