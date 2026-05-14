#!/usr/bin/env bash
# Bandaru Trade Analysis — FULL EXIT
# 1. Kills the Flask server.
# 2. Closes all Safari tabs pointing at the local dashboard (127.0.0.1:5000).
# 3. Closes all Terminal windows running app.py / schwab_setup.py / start-app.command / run-schwab.command.
# 4. Closes this Terminal window last.

set +e   # Don't bail on individual cleanup failures
cd "$(dirname "$0")"

echo "================================================"
echo "  Bandaru Trade Analysis — FULL EXIT"
echo "================================================"
echo ""

# --- 1. Kill Flask on port 5000 ---------------------------------------------
if lsof -ti:5000 >/dev/null 2>&1; then
    PIDS=$(lsof -ti:5000)
    echo "→ Killing Flask (pid: $PIDS)…"
    echo "$PIDS" | xargs kill -9 2>/dev/null
fi

# Kill any lingering app.py / schwab_setup.py processes
ORPHAN=$(pgrep -f "python.*(app.py|schwab_setup.py)" 2>/dev/null)
if [ -n "$ORPHAN" ]; then
    echo "→ Killing Python processes: $ORPHAN"
    echo "$ORPHAN" | xargs kill -9 2>/dev/null
fi

# --- 2. Close Safari tabs pointing at the dashboard --------------------------
echo "→ Closing Safari tabs at 127.0.0.1:5000 / localhost:5000…"
osascript <<'APPLESCRIPT' 2>/dev/null
tell application "Safari"
    if it is running then
        set winList to every window
        repeat with w in winList
            try
                set tabList to every tab of w
                set tabIdx to (count of tabList)
                repeat while tabIdx > 0
                    set t to item tabIdx of tabList
                    try
                        set tabUrl to URL of t
                        if tabUrl is not missing value then
                            if (tabUrl contains "127.0.0.1:5000") or (tabUrl contains "localhost:5000") then
                                close t
                            end if
                        end if
                    end try
                    set tabIdx to tabIdx - 1
                end repeat
            end try
        end repeat
    end if
end tell
APPLESCRIPT

# --- 3. Close all Terminal windows running the app ---------------------------
# We tag this script's window via $TERM_SESSION_ID so we can close it LAST.
THIS_TTY="$(ps -o tty= -p $$ | tr -d ' ')"
echo "→ Closing app Terminal windows (this window TTY: $THIS_TTY)…"

osascript - "$THIS_TTY" <<'APPLESCRIPT' 2>/dev/null
on run argv
    set thisTty to item 1 of argv
    tell application "Terminal"
        if it is running then
            set winList to every window
            repeat with w in winList
                try
                    set tabList to every tab of w
                    repeat with t in tabList
                        try
                            set theTty to tty of t
                            -- Skip our own window — close it last
                            if theTty does not end with thisTty then
                                set procs to processes of t
                                set proclist to procs as string
                                if (proclist contains "app.py") or ¬
                                    (proclist contains "schwab_setup") or ¬
                                    (proclist contains "start-app") or ¬
                                    (proclist contains "run-schwab") or ¬
                                    (proclist contains "run-app") or ¬
                                    (proclist contains "run-live") or ¬
                                    (proclist contains "run-auth") then
                                    -- Try to close the tab; if last tab, close the window
                                    try
                                        close t
                                    on error
                                        try
                                            close w
                                        end try
                                    end try
                                end if
                            end if
                        end try
                    end repeat
                end try
            end repeat
        end if
    end tell
end run
APPLESCRIPT

echo ""
echo "✓ Server stopped. Safari tabs closed. App terminals closed."
echo ""
echo "Closing this window in 2 seconds…"
sleep 2

# --- 4. Close THIS Terminal window last --------------------------------------
osascript -e 'tell application "Terminal" to close (every window whose tty of every tab contains "'"$THIS_TTY"'")' 2>/dev/null

# Fallback if window didn't close: end the shell process to terminate the tab.
exit 0
