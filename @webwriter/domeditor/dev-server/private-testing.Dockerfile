# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app/@webwriter/domeditor
COPY @webwriter/domeditor/package.json ./
# This package has no npm lockfile. Keep the generated lock throughout the build
# so the runtime dependencies match the frontend's resolved installation.
# Vite's optional esbuild peer conflicts with the editor's explicit esbuild
# version. Install the declared versions, as in the existing Bun workspace.
RUN npm install --legacy-peer-deps --include=dev --no-audit --no-fund

FROM dependencies AS frontend
COPY @webwriter/domeditor/ ./
COPY static/ /app/static/
COPY @webwriter/core/model/schemas/resource/themes/ /app/@webwriter/core/model/schemas/resource/themes/
COPY @webwriter/lit/package.json @webwriter/lit/index.js /app/@webwriter/lit/
# Documentation examples import this existing workspace package. Pack it into
# node_modules so its Lit peer resolves from the editor's installation.
RUN npm install --no-save --install-links --legacy-peer-deps --no-audit --no-fund ../lit
ARG VITE_APP_ORIGIN
ARG VITE_EDITOR_ORIGIN
RUN test -n "$VITE_APP_ORIGIN" && test -n "$VITE_EDITOR_ORIGIN" && npm run build

FROM dependencies AS runtime-dependencies
RUN npm prune --legacy-peer-deps --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim AS backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o node -g node -m 0700 /var/lib/webwriter
WORKDIR /app/@webwriter/domeditor
COPY --from=runtime-dependencies /app/@webwriter/domeditor/node_modules/ ./node_modules/
COPY @webwriter/domeditor/package.json ./
COPY @webwriter/domeditor/dev-server/server.mjs @webwriter/domeditor/dev-server/git-packages.mjs @webwriter/domeditor/dev-server/admin.html ./dev-server/
COPY @webwriter/domeditor/src/live-session-permissions.js @webwriter/domeditor/src/widget-grouping.js @webwriter/domeditor/src/example-documents.json ./src/
COPY @webwriter/domeditor/examples/subjects/ ./examples/subjects/
RUN node -e "import('./dev-server/server.mjs')"
USER node
ENV NODE_ENV=production
CMD ["node", "dev-server/server.mjs", "--private-testing"]

FROM nginx:stable-alpine AS proxy
COPY --from=frontend /app/@webwriter/domeditor/dist/ /usr/share/nginx/html/
# Use the same routing and origin separation as the manual deployment. Docker
# publishes container port 8443 only on the configured host VPN address.
COPY @webwriter/domeditor/dev-server/private-testing.nginx.conf.example /tmp/private-testing.conf
RUN mkdir -p /etc/nginx/templates \
    && sed -e 's/listen 100.100.100.10:443 ssl;/listen 8443 ssl;/g' \
           -e 's/authors.vpn.example/${WEBWRITER_APP_HOST}/g' \
           -e 's/content.vpn.example/${WEBWRITER_EDITOR_HOST}/g' \
           -e 's|/srv/webwriter-private/app/dist|/usr/share/nginx/html|g' \
           /tmp/private-testing.conf > /etc/nginx/templates/default.conf.template \
    && rm /tmp/private-testing.conf
