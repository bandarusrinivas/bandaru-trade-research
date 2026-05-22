#!/usr/bin/env bash
# Bandaru Trade Research — Schwab token validation helper.
#
# Source this from any Schwab launcher to verify the token is usable.
# Sets these vars in the calling shell:
#   SCHWAB_TOKEN_STATUS = ok | warn | expired | missing | error
#   SCHWAB_TOKEN_AGE_DAYS = float
#   SCHWAB_TOKEN_MSG = human-readable message
#
# Schwab's refresh token has a 7-day lifetime. Access token is 30 minutes
# and refreshed automatically by schwab-py if the refresh token is still
# valid. So:
#   <= 5 days old  → ok    (safe)
#   5–7 days old   → warn  (works but renew soon)
#   >  7 days old  → expired (refresh token dead; must re-OAuth)

_validate_schwab_token() {
  local token_path="$1"
  [ -n "$token_path" ] || token_path="legacy-python/schwab_token.json"

  if [ ! -f "$token_path" ]; then
    SCHWAB_TOKEN_STATUS="missing"
    SCHWAB_TOKEN_MSG="No Schwab token at $token_path. Run auth-schwab.command first."
    SCHWAB_TOKEN_AGE_DAYS=""
    return 1
  fi

  # Run the age check via python3 — exits with our status code.
  # NOTE: `|| rc=$?` is required. Under `set -e` (which every launcher
  # enables), a bare `output=$(cmd)` whose command exits non-zero aborts
  # the WHOLE script. python exits 1/2/3 for warn/expired/error, so without
  # this guard the launcher dies here instead of reporting the token state.
  local output rc=0
  output=$(python3 - "$token_path" <<'PY' 2>&1
import sys, json, datetime
try:
    with open(sys.argv[1]) as f:
        t = json.load(f)
    ct = t.get("creation_timestamp")
    if not ct:
        print("ERROR:no creation_timestamp")
        sys.exit(3)
    age_days = (datetime.datetime.now().timestamp() - ct) / 86400.0
    if age_days > 7:
        print(f"EXPIRED:{age_days:.1f}")
        sys.exit(2)
    elif age_days > 5:
        print(f"WARN:{age_days:.1f}")
        sys.exit(1)
    else:
        print(f"OK:{age_days:.1f}")
        sys.exit(0)
except Exception as e:
    print(f"ERROR:{e}")
    sys.exit(3)
PY
  ) || rc=$?

  SCHWAB_TOKEN_AGE_DAYS="${output#*:}"
  case "$rc" in
    0) SCHWAB_TOKEN_STATUS="ok"
       SCHWAB_TOKEN_MSG="Token is fresh (${SCHWAB_TOKEN_AGE_DAYS} days old)" ;;
    1) SCHWAB_TOKEN_STATUS="warn"
       SCHWAB_TOKEN_MSG="Token is ${SCHWAB_TOKEN_AGE_DAYS} days old — still works but renew soon" ;;
    2) SCHWAB_TOKEN_STATUS="expired"
       SCHWAB_TOKEN_MSG="Token is ${SCHWAB_TOKEN_AGE_DAYS} days old — refresh token EXPIRED. Re-run auth-schwab.command." ;;
    *) SCHWAB_TOKEN_STATUS="error"
       SCHWAB_TOKEN_MSG="Could not parse $token_path: $output" ;;
  esac
  return "$rc"
}

# Convenience wrapper that prints + returns the right exit code
schwab_token_check() {
  local token_path="${1:-legacy-python/schwab_token.json}"
  _validate_schwab_token "$token_path"
  local rc=$?
  case "$SCHWAB_TOKEN_STATUS" in
    ok)      printf '  \033[1;32m✓\033[0m %s\n' "$SCHWAB_TOKEN_MSG" ;;
    warn)    printf '  \033[1;33m!\033[0m %s\n' "$SCHWAB_TOKEN_MSG" ;;
    expired) printf '  \033[1;31m✗\033[0m %s\n' "$SCHWAB_TOKEN_MSG" ;;
    missing) printf '  \033[1;31m✗\033[0m %s\n' "$SCHWAB_TOKEN_MSG" ;;
    *)       printf '  \033[1;31m✗\033[0m %s\n' "$SCHWAB_TOKEN_MSG" ;;
  esac
  return "$rc"
}
