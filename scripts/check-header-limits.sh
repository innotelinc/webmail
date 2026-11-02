#!/usr/bin/env bash
# Verify the two header ceilings a sign-in on this webmail has to fit through.
#
#   scripts/check-header-limits.sh [base-url] [bytes]
#
# The webmail keeps one token per account slot and an id token is a JWT, so a
# browser signed into a few accounts sends a Cookie header far past 8 KB. Two
# separate limits must sit above that jar size:
#
#   * nginx `large_client_header_buffers` at the edge
#   * Node's `--max-http-header-size` inside the app (16 KiB unless raised)
#
# Either one under the jar size answers 431, or resets the connection, before
# the route ever runs - which is indistinguishable from a wrong password. This
# probes the live path the browser uses, so it fails for the running estate
# rather than for a configuration file that may not be loaded.
#
# Exit status: 0 when this header size is accepted, 1 otherwise.
set -euo pipefail

BASE="${1:-https://oasis.innotel.us}"
SIZE="${2:-16384}"
URL="${BASE%/}/api/health"

payload=$(head -c "$SIZE" /dev/zero | tr '\0' 'a')
status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "Cookie: headerprobe=$payload" "$URL" || echo 000)

echo "probe: ${SIZE}-byte Cookie header -> $URL -> ${status}"

case "$status" in
  000)
    echo "FAIL: the edge closed the connection. Raise nginx large_client_header_buffers (and client_header_buffer_size) above ${SIZE} bytes." >&2
    exit 1 ;;
  431)
    echo "FAIL: request headers too large. If nginx is already raised this is Node's --max-http-header-size; set NODE_OPTIONS=--max-http-header-size=65536 on the app container." >&2
    exit 1 ;;
  2??|3??)
    echo "OK: headers of this size reach the application." ;;
  *)
    echo "WARN: unexpected status ${status}; inspect the edge and the app container by hand." >&2
    exit 1 ;;
esac
