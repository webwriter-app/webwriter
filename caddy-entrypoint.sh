#!/bin/sh
# Starts Caddy. Basic auth is only enabled when both BASIC_USER and BASIC_PASS are set;
# if only one of them is set, startup fails instead of silently serving without a login.
set -eu

AUTH_FILE=/etc/caddy/auth.caddy

if [ -n "${BASIC_USER:-}" ] && [ -n "${BASIC_PASS:-}" ]; then
  HASH=$(caddy hash-password --plaintext "$BASIC_PASS")
  # The editor frame origin stays open: cross-origin iframes can't reliably show a login prompt,
  # and it only serves the same static files as the app origin.
  EDITOR_HOST=$(printf '%s' "${EDITOR_ORIGIN:-}" | sed -E 's#^[a-z]+://##; s#[:/].*$##')
  {
    echo '@protected {'
    echo '	not path /health'
    if [ -n "$EDITOR_HOST" ]; then echo "	not host $EDITOR_HOST"; fi
    echo '}'
    echo 'basic_auth @protected {'
    printf '\t%s %s\n' "$BASIC_USER" "$HASH"
    echo '}'
  } > "$AUTH_FILE"
  echo "basic-auth: enabled for user '$BASIC_USER'${EDITOR_HOST:+ (except $EDITOR_HOST)}"
elif [ -n "${BASIC_USER:-}" ] || [ -n "${BASIC_PASS:-}" ]; then
  echo "basic-auth: BASIC_USER and BASIC_PASS must both be set (or both be empty)" >&2
  exit 1
else
  echo '# basic auth disabled' > "$AUTH_FILE"
  echo "basic-auth: disabled (BASIC_USER/BASIC_PASS not set)"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
