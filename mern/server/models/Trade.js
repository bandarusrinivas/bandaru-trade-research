import mongoose from "mongoose";

// Trade journal entry. All fields are optional so partial entries can be saved
// and refined later. "Days held", "P/L %" are derived in the UI from the dates
// and prices; "P/L amount" is recorded directly so no contract-multiplier has
// to be assumed.
const tradeSchema = new mongoose.Schema({
  ticker:         { type: String, default: "" },
  account_no:     { type: String, default: "" },
  entry_date:     { type: String, default: "" },   // YYYY-MM-DD
  exit_date:      { type: String, default: "" },    // YYYY-MM-DD
  bias:           { type: String, default: "" },    // Bullish | Bearish | Neutral
  strategy:       { type: String, default: "" },    // stock / option strategy
  qty:            { type: Number, default: 1 },
  entry_price:    { type: Number, default: null },
  stop_loss:      { type: Number, default: null },
  estimated_exit: { type: Number, default: null },
  actual_exit:    { type: Number, default: null },
  pnl_amount:     { type: Number, default: null },  // recorded realized P/L ($)
  entry_reason:   { type: String, default: "" },
  exit_reason:    { type: String, default: "" },
  lesson:         { type: String, default: "" },
  status:         { type: String, enum: ["open", "closed"], default: "open" },
}, { timestamps: true });

export default mongoose.model("Trade", tradeSchema);
