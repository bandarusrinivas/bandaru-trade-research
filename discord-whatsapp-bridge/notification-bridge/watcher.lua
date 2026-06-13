--[[
  Discord → WhatsApp notification watcher (Hammerspoon Lua module)

  Polls macOS Notification Center every N seconds for new Discord
  notifications and forwards them to a WhatsApp number via the Meta Cloud
  API. Reuses WHATSAPP_* credentials from the sibling .env file.

  Requires:
    - Hammerspoon (brew install --cask hammerspoon)
    - Full Disk Access granted to Hammerspoon
      (System Settings → Privacy & Security → Full Disk Access → +)
    - Discord desktop app running with native macOS notifications enabled
      for the channels you care about

  Usage from ~/.hammerspoon/init.lua:

      local watcher = dofile("/Users/you/.../notification-bridge/watcher.lua")
      watcher.start({
        env_path = "/Users/you/.../discord-whatsapp-bridge/.env",
        interval = 5,
      })
]]

local M = {}

local NOTIF_DB =
  os.getenv("HOME") ..
  "/Library/Group Containers/group.com.apple.usernoted/db2/db"
local DISCORD_BUNDLE = "com.hnc.Discord"
local STATE_DIR = os.getenv("HOME") .. "/.discord-wa-bridge"
local STATE_FILE = STATE_DIR .. "/state.json"

-- ── tiny helpers ──────────────────────────────────────────────────────────

-- Absolute paths so we don't depend on PATH (and so the login shell's
-- startup output doesn't get mixed into our results).
local SQLITE3 = "/usr/bin/sqlite3"
local PLUTIL  = "/usr/bin/plutil"

local function shell(cmd)
  -- hs.execute(cmd, false) → /bin/sh -c <cmd>, no .zshrc/.bash_profile.
  local out, ok = hs.execute(cmd, false)
  return out or "", ok
end

local function shellEscape(s)
  return "'" .. tostring(s):gsub("'", "'\\''") .. "'"
end

local function trim(s)
  return (s or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

-- ── state ─────────────────────────────────────────────────────────────────

local function readState()
  local f = io.open(STATE_FILE, "r")
  if not f then return { last_rec_id = 0 } end
  local s = f:read("*a") or ""
  f:close()
  if s == "" then return { last_rec_id = 0 } end
  local ok, data = pcall(hs.json.decode, s)
  if ok and type(data) == "table" and tonumber(data.last_rec_id) then
    return { last_rec_id = tonumber(data.last_rec_id) }
  end
  return { last_rec_id = 0 }
end

local function writeState(state)
  shell("mkdir -p " .. shellEscape(STATE_DIR))
  local f = io.open(STATE_FILE, "w")
  if not f then return end
  f:write(hs.json.encode(state))
  f:close()
end

-- ── env loader ────────────────────────────────────────────────────────────

local function loadEnv(envPath)
  local env = {}
  local f = io.open(envPath, "r")
  if not f then return env end
  for line in f:lines() do
    if not line:match("^%s*#") then
      local k, v = line:match("^%s*([%w_]+)%s*=%s*(.-)%s*$")
      if k and v then env[k] = v end
    end
  end
  f:close()
  return env
end

-- ── notification DB reader ────────────────────────────────────────────────

local function discordAppId()
  local out, ok = shell(string.format(
    SQLITE3 .. " %s \"SELECT app_id FROM app WHERE identifier='%s';\" 2>&1",
    shellEscape(NOTIF_DB), DISCORD_BUNDLE
  ))
  if not ok or #out == 0 then return nil, out end
  if out:lower():match("unable to open") or out:lower():match("permission") then
    return nil, "Cannot read Notification Center DB — grant Full Disk Access to Hammerspoon."
  end
  local id = tonumber(out:match("(%-?%d+)"))
  return id, nil
end

local function fetchNewNotifications(lastRecId)
  local appId, err = discordAppId()
  if not appId then return {}, err end
  local sql = string.format(
    "SELECT rec_id FROM record WHERE app_id=%d AND rec_id>%d ORDER BY rec_id ASC;",
    appId, lastRecId
  )
  local out = shell(string.format(
    SQLITE3 .. " %s %s 2>/dev/null",
    shellEscape(NOTIF_DB), shellEscape(sql)
  ))
  local notifications = {}
  for recIdStr in out:gmatch("(%d+)") do
    local recId = tonumber(recIdStr)
    -- Dump the bplist blob to a temp file, convert to JSON via plutil.
    local tmp = string.format("/tmp/dwa-notif-%d.bplist", recId)
    shell(string.format(
      SQLITE3 .. " %s %s 2>/dev/null",
      shellEscape(NOTIF_DB),
      shellEscape(string.format("SELECT writefile('%s', data) FROM record WHERE rec_id=%d;", tmp, recId))
    ))
    local jsonStr = shell(string.format(PLUTIL .. " -convert json -o - %s 2>/dev/null", shellEscape(tmp)))
    shell("rm -f " .. shellEscape(tmp))
    if jsonStr and #jsonStr > 0 then
      local ok, payload = pcall(hs.json.decode, jsonStr)
      if ok and type(payload) == "table" then
        local req = payload.req or payload
        table.insert(notifications, {
          rec_id = recId,
          title = trim(req.titl or req.title or ""),
          subtitle = trim(req.subt or req.subtitle or ""),
          body = trim(req.body or req.Body or ""),
        })
      end
    end
  end
  return notifications, nil
end

-- ── WhatsApp senders ──────────────────────────────────────────────────────
-- Two backends: Meta Cloud API (needs Meta Business account) and Twilio
-- (needs a Twilio account but no Meta Business setup). The dispatcher picks
-- whichever set of env vars is fully populated, preferring Twilio.

local function urlencode(s)
  s = tostring(s or "")
  return (s:gsub("([^%w%-%._~])", function(c)
    return string.format("%%%02X", string.byte(c))
  end))
end

local function sendViaMeta(env, text)
  local url = string.format(
    "https://graph.facebook.com/%s/%s/messages",
    env.WHATSAPP_API_VERSION or "v20.0", env.WHATSAPP_PHONE_ID
  )
  local body = hs.json.encode({
    messaging_product = "whatsapp",
    to = env.WHATSAPP_TO,
    type = "text",
    text = { body = text:sub(1, 4096), preview_url = true },
  })
  hs.http.asyncPost(url, body, {
    ["Authorization"] = "Bearer " .. env.WHATSAPP_TOKEN,
    ["Content-Type"] = "application/json",
  }, function(status, respBody)
    if status < 200 or status >= 300 then
      print(string.format("[wa-bridge] meta send failed (%d): %s", status, tostring(respBody)))
    end
  end)
end

local function sendViaTwilio(env, text)
  local sid = env.TWILIO_ACCOUNT_SID
  local tok = env.TWILIO_AUTH_TOKEN
  local from = env.TWILIO_FROM   -- e.g. whatsapp:+14155238886 (sandbox number)
  local to   = env.TWILIO_TO     -- e.g. whatsapp:+15551234567
  -- Allow the user to omit the "whatsapp:" prefix and add it for them.
  if from and not from:match("^whatsapp:") then from = "whatsapp:" .. from end
  if to   and not to:match("^whatsapp:")   then to   = "whatsapp:" .. to   end
  local url = string.format(
    "https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", sid
  )
  local body = string.format(
    "From=%s&To=%s&Body=%s",
    urlencode(from), urlencode(to), urlencode(text:sub(1, 1500))
  )
  local auth = "Basic " .. hs.base64.encode(sid .. ":" .. tok)
  hs.http.asyncPost(url, body, {
    ["Authorization"] = auth,
    ["Content-Type"]  = "application/x-www-form-urlencoded",
  }, function(status, respBody)
    if status < 200 or status >= 300 then
      print(string.format("[wa-bridge] twilio send failed (%d): %s", status, tostring(respBody)))
    end
  end)
end

local function sendViaTelegram(env, text)
  local url = string.format("https://api.telegram.org/bot%s/sendMessage", env.TELEGRAM_BOT_TOKEN)
  local body = hs.json.encode({
    chat_id = env.TELEGRAM_CHAT_ID,
    text = text:sub(1, 4096),
    disable_web_page_preview = true,
  })
  hs.http.asyncPost(url, body, {
    ["Content-Type"] = "application/json",
  }, function(status, respBody)
    if status < 200 or status >= 300 then
      print(string.format("[wa-bridge] telegram send failed (%d): %s", status, tostring(respBody)))
    end
  end)
end

local function nonEmpty(s) return s and s ~= "" end

local function pickSender(env)
  if nonEmpty(env.TELEGRAM_BOT_TOKEN) and nonEmpty(env.TELEGRAM_CHAT_ID) then
    return "telegram", sendViaTelegram
  end
  if nonEmpty(env.TWILIO_ACCOUNT_SID) and nonEmpty(env.TWILIO_AUTH_TOKEN)
     and nonEmpty(env.TWILIO_FROM) and nonEmpty(env.TWILIO_TO) then
    return "twilio", sendViaTwilio
  end
  if nonEmpty(env.WHATSAPP_PHONE_ID) and nonEmpty(env.WHATSAPP_TOKEN)
     and nonEmpty(env.WHATSAPP_TO) then
    return "meta", sendViaMeta
  end
  return nil, nil
end

local function sendMessage(env, text)
  local provider, fn = pickSender(env)
  if not fn then
    print("[wa-bridge] no provider configured (need TELEGRAM_*, TWILIO_*, or WHATSAPP_* in .env)")
    return
  end
  fn(env, text)
end

-- ── filter + format ───────────────────────────────────────────────────────

local function parseFilter(env)
  local raw = env.DISCORD_CHANNEL_FILTER
  if not raw or raw == "" then return nil end
  local out = {}
  for s in raw:gmatch("([^,]+)") do
    local v = trim(s):lower()
    if v ~= "" then table.insert(out, v) end
  end
  return out
end

local function passesFilter(n, filter)
  if not filter then return true end
  local hay = (n.title .. " " .. n.subtitle):lower()
  for _, s in ipairs(filter) do
    if hay:find(s, 1, true) then return true end
  end
  return false
end

local function formatText(n)
  local parts = {}
  if n.title ~= "" then table.insert(parts, "[" .. n.title .. "]") end
  if n.subtitle ~= "" then table.insert(parts, n.subtitle .. ":") end
  if n.body ~= "" then table.insert(parts, n.body) end
  local s = table.concat(parts, " ")
  if s == "" then return "(empty Discord notification)" end
  return s
end

-- ── main poll ─────────────────────────────────────────────────────────────

local function pollOnce(opts)
  local env = loadEnv(opts.env_path)
  local provider = pickSender(env)
  if not provider then
    print("[wa-bridge] no provider configured — set either TWILIO_* (ACCOUNT_SID, AUTH_TOKEN, FROM, TO) or WHATSAPP_* (PHONE_ID, TOKEN, TO) in .env")
    return
  end
  local state = readState()
  local notifications, err = fetchNewNotifications(state.last_rec_id)
  if err then
    print("[wa-bridge] " .. err)
    return
  end
  if #notifications == 0 then return end
  local filter = parseFilter(env)
  local sent = 0
  for _, n in ipairs(notifications) do
    if passesFilter(n, filter) then
      sendMessage(env, formatText(n))
      sent = sent + 1
    end
    state.last_rec_id = n.rec_id
  end
  writeState(state)
  if sent > 0 then
    print(string.format("[wa-bridge] forwarded %d (last rec_id=%d)", sent, state.last_rec_id))
  end
end

-- ── public API ────────────────────────────────────────────────────────────

function M.start(opts)
  opts = opts or {}
  if not opts.env_path then
    error("watcher.start: env_path is required")
  end
  local interval = tonumber(opts.interval) or 5
  -- On first start, sweep current rec_id forward so we don't replay old
  -- notifications stored in the DB. Comment this out if you want a backfill.
  do
    local state = readState()
    if state.last_rec_id == 0 then
      local out = shell(string.format(
        SQLITE3 .. " %s %s 2>/dev/null",
        shellEscape(NOTIF_DB),
        shellEscape("SELECT COALESCE(MAX(rec_id), 0) FROM record;")
      ))
      local maxId = tonumber(out:match("(%d+)"))
      if maxId then
        writeState({ last_rec_id = maxId })
        print(string.format("[wa-bridge] initialized at rec_id=%d (no backfill)", maxId))
      end
    end
  end
  M._timer = hs.timer.doEvery(interval, function() pollOnce(opts) end)
  print(string.format("[wa-bridge] started — polling every %ds", interval))
end

function M.stop()
  if M._timer then M._timer:stop(); M._timer = nil end
  print("[wa-bridge] stopped")
end

function M.testOnce(opts)
  pollOnce(opts or {})
end

-- Send a manual smoke test message to verify WhatsApp credentials.
function M.smoke(opts)
  opts = opts or {}
  local env = loadEnv(opts.env_path)
  sendMessage(env, "✅ Hammerspoon watcher smoke test — if you see this, .env credentials are good.")
  print("[wa-bridge] smoke test sent")
end

return M
