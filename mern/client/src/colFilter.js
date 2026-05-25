// colFilter.js — helpers for the column-header dropdown filters used by the
// Screener and Pre-Market data grids. Each column header is a <select> whose
// options are the distinct values present in that column; picking one keeps
// only the rows whose displayed cell equals that value.

// True when any column filter has a selected (non-empty) value.
export function hasActiveFilters(filters) {
  return Object.values(filters || {}).some((v) => String(v ?? "").trim() !== "");
}

// Numeric value of a display string, magnitude-aware ("3.4M" → 3 400 000).
// Returns NaN when the string isn't numeric.
function numOf(s) {
  const str = String(s);
  const digits = str.replace(/[^0-9.\-]/g, "");
  let n = parseFloat(digits);
  if (!isFinite(n)) return NaN;
  if (/b/i.test(str)) n *= 1e9;
  else if (/m/i.test(str)) n *= 1e6;
  else if (/k/i.test(str)) n *= 1e3;
  return n;
}

// Distinct, sorted list of display strings for a column's dropdown.
// Blanks and "—" are skipped. Sorts numerically when every value is a
// number, otherwise alphabetically (case-insensitive).
export function distinctSorted(displayValues) {
  const set = new Set();
  for (const v of displayValues) {
    const s = String(v ?? "").trim();
    if (s && s !== "—") set.add(s);
  }
  const arr = [...set];
  const allNum = arr.length > 0 && arr.every((s) => isFinite(numOf(s)));
  arr.sort((a, b) =>
    allNum ? numOf(a) - numOf(b) : String(a).localeCompare(String(b), undefined, { sensitivity: "base" }),
  );
  return arr;
}
