#!/bin/bash
# Double-click me from Finder to run the migration in Terminal.
cd "$(dirname "$0")"
./migrate-out-of-icloud.sh
echo
echo "── done. Press Return to close this window. ──"
read
