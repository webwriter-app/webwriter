#!/bin/sh
# Run under a per-user launchd agent with KeepAlive and ThrottleInterval=10.
set -u
umask 077
configuration=${1:?Pass the directory containing id_ed25519 and known_hosts}
device=${2:?Pass the paired iPad UDID}
iproxy=${3:-/opt/homebrew/bin/iproxy}
forwarder_pid=
ssh_pid=
cleanup() {
  trap '' HUP INT TERM
  if [ -n "$ssh_pid" ]; then kill "$ssh_pid" 2>/dev/null || :; wait "$ssh_pid" 2>/dev/null || :; fi
  if [ -n "$forwarder_pid" ]; then kill "$forwarder_pid" 2>/dev/null || :; wait "$forwarder_pid" 2>/dev/null || :; fi
}
trap cleanup EXIT
trap 'exit 0' HUP INT TERM
if [ -f "$configuration/tunnel.log" ] && [ "$(wc -c < "$configuration/tunnel.log")" -gt 65536 ]; then
  : > "$configuration/tunnel.log"
fi
"$iproxy" -l -s 127.0.0.1 -u "$device" 22223:2223 &
forwarder_pid=$!
# iproxy opens its listener asynchronously. launchd retries after any failure.
attempt=0
until /usr/bin/nc -z 127.0.0.1 22223 2>/dev/null; do
  kill -0 "$forwarder_pid" 2>/dev/null || exit 1
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 0.1
done
/usr/bin/ssh -NT -F /dev/null -p 22223 -i "$configuration/id_ed25519" \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=\"$configuration/known_hosts\"" -o HostKeyAlias=webwriter-ipad-usb \
  -o ExitOnForwardFailure=yes -o ConnectTimeout=5 -o ConnectionAttempts=1 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -R localhost:1234:127.0.0.1:1234 root@127.0.0.1 &
ssh_pid=$!
wait "$ssh_pid"
