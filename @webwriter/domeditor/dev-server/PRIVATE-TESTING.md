# VPN-only private testing

This mode reuses the development backend for a small, trusted tester group.
The VPN controls access; WebWriter supplies no application authentication.
Every author shares the `local-development` identity, document collection,
provider configuration, and administration privileges. Treat every tester as
an administrator of this disposable environment.

`npm start` remains loopback-only with its existing localhost checks. Only
`npm run start:private` enables private testing. Even in this mode, Node still
refuses non-loopback binds. A reverse proxy on the **same host** exposes the
service exclusively on its VPN interface; there is no public listener.

## Docker Compose (recommended)

On a dedicated, VPN-connected **Linux Docker host**, install Docker Engine and
Compose v2.20+ (or a newer Compose release). Clone the full WebWriter repository:
the frontend needs the repository's shared `static/` assets, CSS themes in
`@webwriter/core/`, and `@webwriter/lit/` widget base library, as well as
`@webwriter/domeditor/`. No host Node.js, npm, nginx, or Git installation is needed
for this option. Docker needs outbound access to download images and npm packages.

Prepare the VPN access rules, two DNS names, and a browser-trusted certificate
described below. Place `fullchain.pem` and `privkey.pem` in a directory on the
server, with a certificate valid for **both** names. Mount the complete directory
so certificate renewal by file replacement is visible in the container. Keep
private keys outside the checkout.

From `@webwriter/domeditor/`:

```sh
cp dev-server/private-testing.env.example .env.private-testing
```

Edit `.env.private-testing`: set `WEBWRITER_VPN_IP` to the host's actual VPN IP,
`WEBWRITER_APP_HOST` and `WEBWRITER_EDITOR_HOST` to the two distinct DNS names
(without a scheme, port, or path), and `WEBWRITER_TLS_DIR` to the **absolute**
certificate directory. Leave `WEBWRITER_HTTPS_PORT=443`, or set another available
HTTPS port. Both names must resolve to the VPN IP for tester devices. Do not
use `0.0.0.0`, `::`, or a public/LAN address as the VPN binding.

```sh
docker compose --env-file .env.private-testing -f compose.private-testing.yaml config --quiet
docker compose --env-file .env.private-testing -f compose.private-testing.yaml up -d --build --wait
docker compose --env-file .env.private-testing -f compose.private-testing.yaml ps
```

Open `https://<WEBWRITER_APP_HOST>/editor/` (include the configured HTTPS port
if it is not 443). Configure a test AI provider at `/admin`; the provider settings
and credentials persist with the documents. There is no application login.

The backend and nginx run in separate containers sharing one network namespace.
Node binds to `127.0.0.1:1234` **inside that namespace**, and that port is never
published. Docker publishes only nginx's container port `8443` on the required
host VPN IP and configured HTTPS port. nginx listens on the container interface;
the host binding, VPN ACLs, and Docker-aware firewall enforce access. Do not
enable direct routing to the container network or public forwarding. Confirm
unreachability from outside the VPN, including over IPv6, before inviting testers.
See Docker's [port-publishing documentation](https://docs.docker.com/engine/network/port-publishing/)
for the distinction between host bindings and routed container access.

The backend runs as the unprivileged `node` user with a read-only image, writable
temporary storage, and a named volume at `/var/lib/webwriter`. nginx receives only
the built static frontend and a read-only certificate mount; it never mounts the
data volume. A new volume receives the image's owner-only data-directory
permissions automatically. The Docker build context excludes local environment
files, credentials, development data, dependencies, and build output. No secrets
are build arguments. This package has no npm lockfile; builds resolve its declared
dependency ranges, so keep previously working images when rolling out updates.
The image installer uses `--legacy-peer-deps` to preserve the declared esbuild
version despite Vite's newer optional peer range, matching the existing workspace.

### Updates, certificates, and storage

Rebuild **both services** after updating the checkout or changing hostnames/port.
Compose derives the frontend build origins, backend origins, and nginx hostnames
from the same settings. Recreate both containers together because their network
namespace is shared:

```sh
docker compose --env-file .env.private-testing -f compose.private-testing.yaml up -d --build --force-recreate --wait
```

The nginx example makes static HTML (including directory indexes), the service
worker, and other unversioned files revalidate on both origins. It gives a
one-year immutable cache lifetime only to successful responses for content-
hashed JS and CSS under `/assets/`; 404s remain revalidatable. After the first
rollout of these headers, purge any CDN cache of HTML and fixed-name scripts;
testers may need a forced reload to replace previously cached HTML. During
updates, retain prior content-hashed asset files when practical so tabs already
open on the previous HTML can still load their assets.

To reload renewed certificates without rebuilding:

```sh
docker compose --env-file .env.private-testing -f compose.private-testing.yaml exec nginx nginx -t
docker compose --env-file .env.private-testing -f compose.private-testing.yaml exec nginx nginx -s reload
```

The `webwriter-private_private-data` named volume holds documents, widget data,
grouping definitions, and provider configuration. Container replacement and
ordinary `docker compose down` retain it. **`down --volumes` deletes it**, including
all stored documents and provider credentials. Keep the same Compose project
name (`webwriter-private` by default) to reuse the existing volume.

For a consistent backup, stop the stack and export the volume using the backend
image. Create `/srv/webwriter-backups` with owner-only permissions first; backups
contain plaintext provider credentials and must stay outside the checkout.

```sh
umask 077
docker compose --env-file .env.private-testing -f compose.private-testing.yaml down
docker compose --env-file .env.private-testing -f compose.private-testing.yaml run --rm --no-deps -T --entrypoint tar backend -C /var/lib/webwriter -czf - . > /srv/webwriter-backups/webwriter-private-backup.tar.gz
docker compose --env-file .env.private-testing -f compose.private-testing.yaml up -d --wait
```

To restore into an empty data volume, stop the stack, extract the backup, and
restart. Extracting into an existing volume overwrites matching files but does
not remove newer files:

```sh
docker compose --env-file .env.private-testing -f compose.private-testing.yaml down
docker compose --env-file .env.private-testing -f compose.private-testing.yaml run --rm --no-deps -T --entrypoint tar backend -C /var/lib/webwriter --no-same-owner -xzf - < /srv/webwriter-backups/webwriter-private-backup.tar.gz
docker compose --env-file .env.private-testing -f compose.private-testing.yaml up -d --wait
```

Use `docker compose --env-file .env.private-testing -f compose.private-testing.yaml
logs --tail=100` for diagnostics. Missing configuration fails Compose interpolation;
missing certificates or invalid backend origins prevent a healthy startup. If
the VPN IP is not assigned to this host, Docker cannot bind the published port;
bring up the VPN before the stack. Active live sessions and unsaved collaboration
state remain temporary, even with persistent storage.

## Manual deployment

The following sections describe running the same setup without Docker Compose.

## Prepare a dedicated host

Use a separate VM or container host with no personal development data or
credentials. Install Node.js with `process.loadEnvFile` support (Node 22+), npm,
and nginx. Install Git too if testing Git packages. Run Node as an unprivileged
service user. This is a single-instance deployment: collaboration and live
sessions use process-local state.

Before starting the proxy:

1. Join the host and tester devices to your VPN. Restrict VPN ACLs to the
   intended testers and this host's HTTPS port. Do not grant general access to
   the host or your other machines.
2. Configure two DNS names that resolve to the host's **VPN address** on tester
   devices: for example `authors.vpn.example` and `content.vpn.example`.
3. Obtain a TLS certificate valid for both names and trusted by tester browsers.
   A certificate obtained using DNS validation, or a private CA installed on
   tester devices, avoids opening public HTTP ports. VPN encryption alone does
   not enable browser secure-context APIs such as service workers.
4. Ensure the firewall denies public/LAN ingress to this service, including
   IPv6. The nginx listeners below must bind to the VPN address, not a wildcard.
   Disable any public forwarding, public sharing, or public ingress feature.
5. Create `/srv/webwriter-private/data` owned by the service user with mode
   `0700`, and place this checkout at `/srv/webwriter-private/app`. Adjust these
   paths if using another location. Back up test documents if needed.

The backend cannot detect whether a proxy is VPN-only. Host and Origin checks
are browser protections, not authentication; the network restrictions are
mandatory.

## Build and start

From the checkout, as the service user:

```sh
export VITE_APP_ORIGIN=https://authors.vpn.example
export VITE_EDITOR_ORIGIN=https://content.vpn.example
export WEBWRITER_DEV_HOST=127.0.0.1
export WEBWRITER_DEV_PORT=1234
export WEBWRITER_DEV_DATA_DIR=/srv/webwriter-private/data
npm install --legacy-peer-deps
npm run build
npm run start:private
```

Keep these variables in the process manager's environment for restarts. They
can also live in this dedicated checkout's ignored `.env.local`; both Vite and
the backend load it. Do not commit that file. Rebuild when either origin changes,
and restart the backend with the same values. Origins must be distinct, exact
HTTPS origins without paths, queries, or credentials. Include a non-default
HTTPS port in both variables and proxy configuration if using one.

Private mode requires an explicit data directory and refuses the default
`.webwriter-dev/` directory. It never starts Vite or serves source files. The
proxy serves `dist/` on both origins. Node serves the existing APIs, admin
dashboard, collaboration WebSockets, and published live documents.

Configure an AI provider at the application origin's `/admin`, using a separate
test credential and a provider-enforced spending limit. Alternatively, supply
the existing `OPENAI_API_KEY` environment variable through your secret store or
ignored `.env.local`. Provider keys entered in the dashboard are plaintext files
inside the protected data directory. All testers can change providers and their
endpoints; do not use a valuable production credential. The VPN does not limit
AI spending or make the environment offline: AI and public widget packages need
outbound internet access.

## Configure the reverse proxy

Use [`private-testing.nginx.conf.example`](private-testing.nginx.conf.example)
inside nginx's `http {}` configuration. Replace the VPN IP, both DNS names,
certificate paths, checkout path, and backend port. Keep the upstream Host header
unchanged: Node validates it against the two configured origins and ignores
forwarded host/protocol headers when generating URLs.

Ensure nginx's usual `mime.types` file is included in its `http {}` block so
JavaScript modules and CSS receive the correct content types. The example uses
nginx's documented [WebSocket forwarding](https://nginx.org/en/docs/http/websocket.html).

The application origin routes `/api/`, `/admin`, and WebSocket upgrades to
loopback. Other requests serve static directory indexes with 404s for missing
pages. It blocks `/live/` so authored HTML cannot run on the application origin.
The content origin serves the same static build plus `/live/` from the backend;
its API and admin routes are blocked. Do not collapse these origins or add a
blanket frame-denial header that blocks the editor iframe.

WebSocket forwarding and disabled response buffering preserve collaboration and
streaming AI responses. The backend accepts browser requests from only the two
configured HTTPS origins. Private WebSockets require one of those Origins and
the application Host. The discovery endpoint advertises
`kind: "webwriter-cloud-service"`, `authentication: "none"`, and canonical
HTTPS/WSS URLs, so the existing frontend connects without a login or access
token. No localhost URL checks in the client are relaxed.

Run `nginx -t`, then start/reload nginx and supervise Node using your existing
service manager. Do not run the service manager as root for Node. Removing a
tester from the VPN is the access-revocation mechanism; disconnect their active
VPN connections as well.

## Verify before inviting testers

- From outside the VPN, both origins and the service ports must be unreachable.
- From two VPN devices, open `https://authors.vpn.example/editor/`. The backend
  should connect automatically. Its `/api/session` must advertise HTTPS/WSS URLs
  for the configured application host, never localhost or an internal HTTP URL.
- Confirm the editor frame and service worker load from the content origin with
  no certificate, CORS, or mixed-content errors.
- Create, save, reload, and edit a server document. Open its editing link on the
  second device and check concurrent edits and remote presence.
- Start a live session and open the learner link on the second device. Its HTML
  must load from the content origin, its WebSocket from the application origin.
  Check learner interaction, host controls, and ending the session.
- Exercise a shared-data widget and a streaming AI edit. Check the AI provider's
  usage dashboard and test spending limit.
- Restart Node: saved documents and widget data persist in the configured data
  directory; active live sessions and ordinary collaboration rooms do not.
  Reload saved documents to resume testing.

## Test limitations

There are no private documents or author permissions within the tester group.
The default widget resolver also treats every participant as `local-development`
and has no separate group assignments. Per-user widget isolation, real rosters,
group allocation between distinct users, account attribution, and authentication
cannot be validated in this mode. Live-session host/learner capability checks
remain active, but the environment itself is trusted and shared.

Every learner or link recipient needs VPN access. Document and widget files
persist, while live sessions, ordinary collaboration rooms, and Git snapshots
are temporary. This mode is for functional testing and is not a production
multi-user service.
