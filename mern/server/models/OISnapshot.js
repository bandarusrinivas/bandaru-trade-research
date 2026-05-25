// Daily open-interest snapshot of an option chain.
//
// The data feeds only return TODAY's open interest — there is no historical OI
// endpoint. To track OI change over time the app stores one snapshot per
// (ticker, trading day); the /api/oi-flow route then diffs consecutive days.
// History therefore builds up going forward — it cannot be backfilled — and
// is auto-pruned after 120 days by the TTL index below.

import mongoose from "mongoose";

const contractSchema = new mongoose.Schema({
  strike:        { type: Number },
  type:          { type: { type: String } }, // "call" | "put"
  open_interest: { type: Number, default: 0 },
  volume:        { type: Number, default: 0 },
  last:          { type: Number, default: null },
  iv:            { type: Number, default: null },
}, { _id: false });

const oiSnapshotSchema = new mongoose.Schema({
  ticker:    { type: String, required: true },
  date:      { type: String, required: true },  // YYYY-MM-DD (US/Eastern)
  spot:      { type: Number, default: null },
  contracts: { type: [contractSchema], default: [] },
}, { timestamps: true });

oiSnapshotSchema.index({ ticker: 1, date: 1 }, { unique: true });

// TTL index — MongoDB auto-deletes snapshots older than 120 days. /api/oi-flow
// only ever diffs consecutive trading days, so unbounded retention would just
// bloat the collection forever.
oiSnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 24 * 60 * 60 });

export default mongoose.model("OISnapshot", oiSnapshotSchema);
