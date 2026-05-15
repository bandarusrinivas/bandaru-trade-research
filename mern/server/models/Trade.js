import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema({
  type:       { type: String, enum: ["CALL", "PUT"], required: true },
  strike:     { type: Number, required: true },
  entry_price:{ type: Number, required: true },
  exit_price: { type: Number, default: null },
  qty:        { type: Number, default: 1 },
  expiration: { type: String, required: true },   // YYYY-MM-DD
  platform:   { type: String, default: "" },
  notes:      { type: String, default: "" },
  status:     { type: String, enum: ["open", "closed"], default: "open" },
  opened_at:  { type: Date, default: () => new Date() },
  closed_at:  { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("Trade", tradeSchema);
