# --- Build ---
# Vite must run under Node: the component-licenses plugin relies on require.resolve.paths(), which Bun doesn't implement
FROM node:22-slim AS build
RUN npm install -g bun@1.2
WORKDIR /app

# Editor frames must run on a separate origin from the app. Both are baked in at build time.
# Leave empty for local testing: the app then pairs 127.0.0.1 <-> localhost automatically.
ARG VITE_APP_ORIGIN=""
ARG VITE_EDITOR_ORIGIN=""
ENV VITE_APP_ORIGIN=$VITE_APP_ORIGIN \
    VITE_EDITOR_ORIGIN=$VITE_EDITOR_ORIGIN

COPY . .
RUN bun install && bun run preparestatic
RUN cd @webwriter/domeditor && node node_modules/vite/bin/vite.js build

# --- Serve ---
FROM caddy:2-alpine
# Lets caddy-entrypoint.sh exempt the editor frame origin from basic auth
ARG VITE_EDITOR_ORIGIN=""
ENV EDITOR_ORIGIN=$VITE_EDITOR_ORIGIN
COPY --from=build /app/@webwriter/domeditor/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
COPY caddy-entrypoint.sh /usr/local/bin/caddy-entrypoint.sh
EXPOSE 80

# Basic auth is enabled only when BASIC_USER and BASIC_PASS are both set at runtime
ENTRYPOINT ["/bin/sh", "/usr/local/bin/caddy-entrypoint.sh"]

# Checks the app shell too, so a broken /srv fails the check, not just a running Caddy.
# The app shell is checked on the internal listener, which bypasses basic auth.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/health && wget -q --spider http://127.0.0.1:8099/index.html || exit 1
