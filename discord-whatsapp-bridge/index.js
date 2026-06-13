// discord-whatsapp-bridge
// Listens for messages on configured Discord channels and forwards them to a
// single WhatsApp number via the Meta WhatsApp Cloud API.
//
//   npm install
//   cp .env.example .env   # then fill in the values
//   npm start

require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");

const {
  DISCORD_TOKEN,
  CHANNEL_IDS,
  WHATSAPP_PHONE_ID,
  WHATSAPP_TOKEN,
  WHATSAPP_TO,
  WHATSAPP_API_VERSION = "v20.0",
} = process.env;

// ── env validation ───────────────────────────────────────────────────────────
const required = { DISCORD_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN, WHATSAPP_TO };
const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`[bridge] Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const allowedChannels = new Set(
  (CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
if (!allowedChannels.size) {
  console.warn("[bridge] CHANNEL_IDS is empty — no channels will be forwarded.");
}

// ── WhatsApp Cloud API client ────────────────────────────────────────────────
const WHATSAPP_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;
const MAX_BODY = 4096; // WhatsApp text body limit

async function sendWhatsAppText(body) {
  const text = body.length > MAX_BODY ? body.slice(0, MAX_BODY - 1) + "…" : body;
  const res = await fetch(WHATSAPP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: WHATSAPP_TO,
      type: "text",
      text: { body: text, preview_url: true },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp ${res.status}: ${detail}`);
  }
}

// Very small queue so a burst of Discord messages doesn't hit WhatsApp's rate
// limits all at once. Sends sequentially with a tiny gap.
const queue = [];
let draining = false;
async function enqueue(body) {
  queue.push(body);
  if (draining) return;
  draining = true;
  while (queue.length) {
    const next = queue.shift();
    try {
      await sendWhatsAppText(next);
    } catch (e) {
      console.error("[bridge] forward failed:", e.message);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  draining = false;
}

// ── Discord client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bridge] Discord ready as ${c.user.tag}`);
  console.log(
    `[bridge] forwarding ${allowedChannels.size} channel(s) → +${WHATSAPP_TO}`
  );
});

client.on(Events.MessageCreate, (msg) => {
  if (msg.author?.bot) return;
  if (!allowedChannels.has(msg.channelId)) return;
  if (!msg.content && msg.attachments.size === 0) return;

  const channelName = msg.channel?.name ? `#${msg.channel.name}` : msg.channelId;
  const guildName = msg.guild?.name ? ` (${msg.guild.name})` : "";
  const author = msg.member?.displayName || msg.author.username;

  const parts = [`[${channelName}${guildName}] ${author}:`];
  if (msg.content) parts.push(msg.content);
  for (const att of msg.attachments.values()) parts.push(att.url);

  enqueue(parts.join("\n"));
});

client.on(Events.Error, (e) => console.error("[bridge] discord error:", e));

process.on("SIGINT", () => {
  console.log("[bridge] shutting down");
  client.destroy().finally(() => process.exit(0));
});

client.login(DISCORD_TOKEN);
