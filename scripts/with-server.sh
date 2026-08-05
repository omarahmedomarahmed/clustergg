#!/usr/bin/env bash
# Start a production server, run a command against it, and ALWAYS stop it.
#
#   scripts/with-server.sh 3031 node tests/ui/marketplace.mjs
#
# Why this exists: `next start` never exits, so every one started by hand and
# left behind sits as a stuck background process — and the matcher people reach
# for (`pgrep -f next-server`) matches the shell doing the searching, so the
# cleanup silently kills nothing. This traps EXIT, so the server dies even when
# the command fails or the run is interrupted.
set -uo pipefail
PORT="${1:?usage: with-server.sh PORT COMMAND...}"; shift

kill_servers() {
  local me=$$
  for p in /proc/[0-9]*/cmdline; do
    local pid; pid="$(basename "$(dirname "$p")")"
    [ "$pid" = "$me" ] && continue
    local c; c="$(tr '\0' ' ' < "$p" 2>/dev/null)" || continue
    # Anchored: the real process's cmdline STARTS with these. An unanchored
    # match hits this very script and kills nothing useful.
    case "$c" in
      "next-server"*|"next start"*|"sh -c next start"*) kill -9 "$pid" 2>/dev/null ;;
    esac
  done
}

cleanup() { kill_servers; }
trap cleanup EXIT INT TERM

kill_servers
sleep 1
DEMO_DB=1 npx next start -p "$PORT" >/tmp/with-server-$PORT.log 2>&1 &
for _ in $(seq 1 60); do
  curl -s -o /dev/null --max-time 1 "http://localhost:$PORT/" && break
  sleep 1
done
if ! curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then
  echo "server never came up on $PORT — last log:" >&2
  tail -20 "/tmp/with-server-$PORT.log" >&2
  exit 1
fi

BASE_URL="http://localhost:$PORT" "$@"
