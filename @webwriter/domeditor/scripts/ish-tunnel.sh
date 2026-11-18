#!/bin/sh
# iSH-only helper for the explicitly authorized personal iPad SSH tunnel.
# Configure the webwriter-mac SSH alias before starting; see dev-server/ISH-TESTING.md.
set -u
umask 077

script=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
state=${WEBWRITER_TUNNEL_STATE_DIR:-"$HOME/.local/state/webwriter-tunnel"}
target=${WEBWRITER_TUNNEL_HOST:-webwriter-mac}
mode=${WEBWRITER_TUNNEL_MODE:-ssh}
sshd=${WEBWRITER_TUNNEL_SSHD:-/usr/sbin/sshd}
retry=${WEBWRITER_TUNNEL_RETRY_SECONDS:-10}
location=${WEBWRITER_TUNNEL_LOCATION:-/dev/location}
lock=$state/lock
log=$state/tunnel.log
case $mode in ssh|usb) ;; *) echo 'Tunnel mode must be ssh or usb.'; exit 2 ;; esac

owner() {
  [ -r "$lock/pid" ] || return 1
  read -r pid < "$lock/pid"
  case $pid in ''|*[!0-9]*) return 1 ;; esac
  [ "$pid" -gt 1 ] && kill -0 "$pid" 2>/dev/null || return 1
  # A stale PID must never make stop signal an unrelated process.
  if [ -r "/proc/$pid/cmdline" ]; then
    command_line=$(tr '\000' ' ' < "/proc/$pid/cmdline")
  else
    command_line=$(ps -p "$pid" -o command= 2>/dev/null) || return 1
  fi
  case $command_line in *"$script run"*) return 0 ;; *) return 1 ;; esac
}

case ${1:-start} in
  start)
    if [ "$mode" = usb ]; then
      [ -x "$sshd" ] || { echo 'Install the SSH server first: apk add openssh'; exit 1; }
      command -v setsid >/dev/null 2>&1 || { echo 'USB mode needs the setsid command.'; exit 1; }
    else
      command -v ssh >/dev/null 2>&1 || { echo 'Install SSH first: apk add openssh-client'; exit 1; }
    fi
    [ -r "$location" ] || { echo 'Run this helper inside iSH, where /dev/location is available.'; exit 1; }
    mkdir -p "$state"
    if owner; then echo "Tunnel supervisor already running (PID $pid)."; exit 0; fi
    nohup sh "$script" run >> "$log" 2>&1 < /dev/null &
    attempt=0
    while [ "$attempt" -lt 30 ]; do
      if owner; then echo "Tunnel supervisor started. Log: $log"; exit 0; fi
      sleep 0.1
      attempt=$((attempt + 1))
    done
    echo "Could not start the tunnel supervisor. See $log"
    exit 1
    ;;
  stop)
    if owner; then
      kill -TERM "$pid"
      echo 'Stopping the tunnel and its background location reader.'
    else
      echo 'Tunnel supervisor is not running.'
    fi
    ;;
  status)
    if owner; then
      echo "Tunnel supervisor running (PID $pid); SSH may still be reconnecting."
      echo "Log: $log"
    else
      echo 'Tunnel supervisor is not running.'
      exit 1
    fi
    ;;
  run)
    case $retry in ''|*[!0-9]*|0) echo 'Retry delay must be a positive integer.'; exit 1 ;; esac
    mkdir -p "$state"
    if ! mkdir "$lock" 2>/dev/null; then
      if owner; then exit 0; fi
      # Another launcher may be between mkdir and writing its PID.
      [ -f "$lock/pid" ] || exit 1
      rm -f "$lock/pid"
      rmdir "$lock" 2>/dev/null && mkdir "$lock" 2>/dev/null || exit 1
    fi
    printf '%s\n' "$$" > "$lock/pid"
    # A bounded log is kept for the current session; previous sessions are discarded.
    : > "$log"
    location_pid=
    child_pid=
    cleanup() {
      trap '' HUP INT TERM
      if [ -n "$child_pid" ]; then
        if [ "$mode" = usb ]; then kill -TERM -- "-$child_pid" 2>/dev/null || :; fi
        kill "$child_pid" 2>/dev/null || :
        wait "$child_pid" 2>/dev/null || :
      fi
      if [ -n "$location_pid" ]; then kill "$location_pid" 2>/dev/null || :; wait "$location_pid" 2>/dev/null || :; fi
      rm -f "$lock/pid"
      rmdir "$lock" 2>/dev/null || :
    }
    trap cleanup EXIT
    trap 'exit 0' HUP INT TERM
    cat "$location" > /dev/null &
    location_pid=$!
    while :; do
      if ! kill -0 "$location_pid" 2>/dev/null; then
        echo 'Location reader stopped. Allow Always location access for iSH, then start again.'
        exit 1
      fi
      # USB mode lets the Mac initiate the tunnel even on isolated Wi-Fi networks.
      # The separate key file and forced command allow only the editor forward.
      if [ "$mode" = usb ]; then
        setsid "$sshd" -D -e -f /dev/null -h /etc/ssh/ssh_host_ed25519_key -p 2223 \
          -o ListenAddress=127.0.0.1 -o PermitRootLogin=prohibit-password \
          -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
          -o AllowUsers=root -o AuthorizedKeysFile=/root/.ssh/webwriter-usb-authorized_keys \
          -o AllowTcpForwarding=remote -o PermitListen=localhost:1234 \
          -o GatewayPorts=no -o AllowStreamLocalForwarding=no \
          -o AllowAgentForwarding=no -o PermitTTY=no -o X11Forwarding=no \
          -o PidFile=/run/webwriter-usb-sshd.pid &
      else
        # Keep SSH attached to this supervisor so cancellation owns it.
        ssh -NT -o BatchMode=yes -o StrictHostKeyChecking=yes \
          -o ExitOnForwardFailure=yes -o ConnectTimeout=5 -o ConnectionAttempts=1 \
          -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
          -o ControlMaster=no -o ControlPath=none \
          -L localhost:1234:127.0.0.1:1234 "$target" &
      fi
      child_pid=$!
      wait "$child_pid" || :
      if [ "$mode" = usb ]; then kill -TERM -- "-$child_pid" 2>/dev/null || :; fi
      child_pid=
      echo "$(date): SSH stopped; retrying in $retry seconds."
      # Avoid an indefinitely growing log while the Mac is unavailable.
      if [ "$(wc -c < "$log")" -gt 65536 ]; then : > "$log"; fi
      sleep "$retry" &
      child_pid=$!
      wait "$child_pid" || :
      child_pid=
    done
    ;;
  *) echo "Usage: $0 [start|stop|status]"; exit 2 ;;
esac
