// Black-Scholes option pricing + Greeks.
// Used by the Option Decay feature to model how an option premium changes
// across stock price and time-to-expiration.

// Standard normal CDF — Abramowitz & Stegun 7.1.26 approximation
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
              + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

// Standard normal PDF
function normPdf(x) {
  return 0.3989422804014327 * Math.exp(-(x * x) / 2);
}

/**
 * Price a European option + its Greeks via Black-Scholes.
 *   S     spot price
 *   K     strike
 *   T     time to expiration, in YEARS
 *   r     risk-free rate (decimal, e.g. 0.05)
 *   sigma implied volatility (decimal, e.g. 0.15)
 *   type  "call" | "put"
 *
 * Returns { price, delta, gamma, theta, vega, vanna, intrinsic, extrinsic }.
 * theta is per-DAY, vega and vanna are per 1-vol-point (1% IV move).
 */
export function blackScholes({ S, K, T, r = 0.05, sigma, type = "call" }) {
  const isCall = type === "call";
  const intrinsic = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);

  // At/near expiration → premium collapses to intrinsic value
  if (T <= 0 || sigma <= 0) {
    return {
      price: intrinsic,
      delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      vanna: 0,
      intrinsic,
      extrinsic: 0,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);

  let price, delta;
  if (isCall) {
    price = S * normCdf(d1) - K * disc * normCdf(d2);
    delta = normCdf(d1);
  } else {
    price = K * disc * normCdf(-d2) - S * normCdf(-d1);
    delta = normCdf(d1) - 1;
  }

  const gamma = normPdf(d1) / (S * sigma * sqrtT);
  const vega = (S * normPdf(d1) * sqrtT) / 100; // per 1% vol move
  // Vanna = ∂Δ/∂σ = -φ(d1) · d2 / σ — same value for calls and puts.
  // Divided by 100 to express "per 1-vol-point" (1% IV move), matching vega.
  const vanna = (-normPdf(d1) * d2) / (sigma * 100);

  // Theta — annualized, then converted to per-day
  const term1 = -(S * normPdf(d1) * sigma) / (2 * sqrtT);
  let thetaAnnual;
  if (isCall) {
    thetaAnnual = term1 - r * K * disc * normCdf(d2);
  } else {
    thetaAnnual = term1 + r * K * disc * normCdf(-d2);
  }
  const theta = thetaAnnual / 365;

  const finalPrice = Math.max(price, 0);
  return {
    price: finalPrice,
    delta,
    gamma,
    theta,
    vega,
    vanna,
    intrinsic,
    extrinsic: Math.max(finalPrice - intrinsic, 0),
  };
}

/**
 * Solve for implied volatility from a known market premium, via bisection.
 * Returns sigma (decimal) or null if it can't converge.
 */
export function impliedVolatility({ S, K, T, r = 0.05, marketPrice, type = "call" }) {
  if (T <= 0 || marketPrice <= 0) return null;
  let lo = 0.01, hi = 5.0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const { price } = blackScholes({ S, K, T, r, sigma: mid, type });
    if (Math.abs(price - marketPrice) < 0.001) return mid;
    if (price > marketPrice) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// Years-to-expiration from hours remaining (calendar time)
export function yearsFromHours(hours) {
  return Math.max(hours, 0) / (365 * 24);
}
