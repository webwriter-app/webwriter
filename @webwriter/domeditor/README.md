# DOMEditor development server

Run the editor and its localhost backend together:

```sh
npm start
```

Open the landing page at `http://127.0.0.1:1234/`, the editor at `http://127.0.0.1:1234/editor/`, or the documentation at `http://127.0.0.1:1234/docs/`.

The server listens on `http://127.0.0.1:1234` and refuses non-loopback bind addresses. It has no authentication and must never be exposed to a network. The editor probes `/api/session`, automatically signs in to this no-auth development session, and uses server documents and server-managed AI providers by default. Click **Local dev** in the ribbon to open the admin dashboard, or visit `http://127.0.0.1:1234/admin`.

Editor and preview iframes use the paired `localhost` origin in development. The app at `127.0.0.1` and the frames at `localhost` share the port but have different origins. Opening the landing page or editor through another loopback alias redirects to the application origin, preserving document-link parameters. For a deployed build, serve the same static files at a dedicated editor origin and set `VITE_APP_ORIGIN` and `VITE_EDITOR_ORIGIN` to the two exact HTTPS origins when building. The frame origin must serve `frame-shell.html`, `local-package-service-worker.js`, and the generated `assets/` files. Collaboration servers and widget asset hosts must also accept requests from the editor origin. Keep it separate from the application origin; the frames require both `allow-scripts` and `allow-same-origin` for native editing and widget support.

Document, provider, and administration APIs accept browser requests only from the application origin. Frames retain access to widget-data resolution, grouping context, and immutable Git package resources. When running a separate frontend with `npm run start:frontend`, set `VITE_APP_ORIGIN` and `VITE_EDITOR_ORIGIN` to its exact loopback origins in both processes; for example `http://localhost:5173` and `http://127.0.0.1:5173`. The backend data directory is excluded from Vite file serving.

Data is stored in the ignored `.webwriter-dev/` directory. Provider files have owner-only permissions, but API keys are still stored as plaintext development secrets. `OPENAI_API_KEY` can instead be set in `.env.local`; it creates an OpenAI provider whose key stays in the environment.

For trusted remote testers, an explicit **VPN-only private-testing mode** reuses
this backend with a shared identity and no application login. It keeps Node on
loopback, requires separate HTTPS application/content origins and an isolated
data directory, and runs without Vite behind a VPN-bound reverse proxy serving
the built frontend. Start it with `npm run start:private` after following the
[deployment instructions](dev-server/PRIVATE-TESTING.md). The VPN must enforce
access; this mode must never be publicly reachable. Ordinary `npm start` keeps
all existing localhost restrictions.

The guide includes a [Docker Compose setup](compose.private-testing.yaml) with
nginx, TLS certificate mounts, VPN-specific HTTPS publishing, and persistent
backend storage. Start from
[`dev-server/private-testing.env.example`](dev-server/private-testing.env.example).

## Static multipage build

```sh
npm run build
npm run preview
```

The build produces `dist/` with independent landing (`/`), Widgets (`/gallery/`), documentation (`/docs/`), and editor (`/editor/`) pages. Serve directory indexes normally and return 404 for missing pages; no SPA fallback or documentation server is required. The preview server binds only to `127.0.0.1`.

Application and frame scripts use content-hashed filenames. For nginx deployments,
send `Cache-Control: no-cache` for HTML (including directory indexes), the service
worker, and other unversioned files on both origins. Only successfully served
content-hashed JS and CSS under `/assets/` should receive
`Cache-Control: public, max-age=31536000, immutable`; the private-testing nginx
example applies this policy.

Production builds also emit `version.json`. Open editors check it every minute
while visible and when returning to the tab or coming online. A new build shows
a closable speech bubble at the app icon with a Reload button. Reload remains
the user's choice and uses the existing unsaved-work warning. Serve the marker
with `Cache-Control: no-cache`, as in the nginx example, and deploy it alongside
the matching HTML and assets. Development builds do not check for updates.

Documentation uses the same Markdown renderer as development. The build emits highlighted HTML, navigation, styles, icons, original example downloads, and bundled live previews. Lit uses the default `.html` pages; the other library choices have `.vanilla.html`, `.react.html`, `.vue.html`, `.angular.html`, and `.svelte.html` variants. The library selector preserves the current page and fragment. Existing `?library=` links to generated pages select the corresponding variant.

Keep the build base at `/`: moving the application entry to `/editor/` does not move `frame-shell.html`, frame entry assets, the service worker, or `/api/` endpoints. Deploy the frame files on the separate origin described above and configure the existing backend separately. The local development backend is not a production server.

Legacy root and `/index.html` URLs with document, collaboration, or live-session parameters redirect in the browser to `/editor/`, retaining the complete query and fragment. Newly created document and invitation links use `/editor/` directly. A plain root URL displays the landing page.

The public pages support English, German, French, Dutch, Spanish, Portuguese,
and Italian. The first supported browser language is selected automatically;
the footer switcher saves an explicit choice for future visits. A `?lang=de`
query can override that choice for a link. Shared site copy lives in
`src/site-translations.ts`; curated documents and layout recordings have locale
subdirectories in `examples/subjects/` and `src/assets/layouts/`. Example dialogs,
downloads, and “Edit in WebWriter” use the selected language. Documentation
content and the published widget catalog remain English.

## Widgets

The **Widgets** navigation item opens `/gallery/`. It reads the current npm catalog of published `@webwriter/…` packages carrying the `webwriter-widget` keyword, following all search result pages. Each package gets one card; search includes its widget and snippet names. No package list is frozen into the build.

Open a package to switch between its widgets and published snippets in learner view. Widget defaults use a matching published example when available, or an existing example lesson before falling back to the widget's default state. Snippet-only collections such as PhET are included. Reset recreates the example; closing it removes the frame. Previews use the existing separate frame origin, package dependency resolver, and preview serialization, with editing disabled. The catalog and published assets require an internet connection; the gallery needs no development backend.

## Document links

Opening or saving a document updates the editor URL's `open` parameter. Reloading that URL restores the saved document. A local link has the form `?open=local%3A<id>` and uses a file handle retained in this browser, including after the file leaves the recent-document list. The file must remain accessible; another browser or device needs to open the file first.

A server document link contains its full API document URL, for example `?open=http%3A%2F%2Flocalhost%3A1234%2Fapi%2Fdocuments%2F<document-id>`. The editor connects to that exact endpoint and loads the document by ID. Server links use the existing supported backend and its access rules. Links store references only; they do not contain document content or credentials. Creating a new document clears `open`, while failed or cancelled opens keep the previous document URL. Live-session links take precedence over document links.

## Widget documentation

Start with the [widget documentation](docs/widgets/index.md) for an introduction, quick start, quiz tutorial, guides, and interface reference.

With `npm start`, browse [Widget documentation](http://127.0.0.1:1234/docs/) for section navigation, syntax highlighting, and live tutorial examples in JS, Lit, React, Vue, Angular, and Svelte. The library selector keeps the choice across pages. Markdown changes reload the page automatically. The same `/docs/` route is available with `npm run start:frontend` on its printed local URL.

## Developer packages

Open the developer console, then use **Add package → Add from local folder** for a local folder or **Add package → Add from Git repository** for an anonymous public Git remote (HTTP, HTTPS, or `git://`, including GitHub and GitLab). Enter a branch or tag, or leave it empty for the default branch. An optional package folder supports repositories containing multiple packages. The selected ref must contain `package.json` and the package's built exports; the editor does not run repository build scripts.

Git packages require the development backend and Git installed on its host. Their contents are read-only. Git fetches into a temporary bare repository which is deleted after the transfer, including on failure. Runtime files are served from immutable snapshots in server memory with `Cache-Control: no-store`; no package checkout or persistent content cache is created. Only the repository/ref/folder descriptor is saved in browser settings, and reopening the app fetches it again. The refresh button at the bottom right of each package item refetches its source and reloads it even when Auto-reload is off. Hover or focus the source badge over the package icon to see the repository URL or local folder name.

## Example lessons

[`examples/`](examples/) contains editable HTML lessons. The public `/examples/` gallery offers biology, history, computer science, arts, languages, social science, chemistry, earth science, physics, and mathematics activities with learner previews, standalone HTML downloads, and `/editor/?example=…` links that open editable copies. The landing-page miniatures are extracted from those same documents. Widget assets and external media load online.

Start or restart the dev server to load editable copies of the ten landing-page lessons into the server document list. The server uses the same catalog and authored HTML as the main page. Saved edits survive restarts; deleting an example restores the bundled version on the next start. Startup removes the old numbered lessons and the former MathML and Kitchen Sink presets from server storage, leaving other saved documents alone.

The [Mozilla MathML Test](examples/mozilla-mathml-test.html) and [Kitchen Sink](examples/kitchen-sink.html) remain available as standalone HTML fixtures.

## APIs

- `GET /api/session` — backend probe and no-auth login metadata
- `POST /api/developer-packages/git` — fetch a public Git ref into an in-memory package snapshot
- `GET|HEAD /api/developer-packages/git/:snapshot/:path` — read an immutable package file
- `GET|POST /api/documents` and `GET|PUT|PATCH|DELETE /api/documents/:id` — document CRUD
- `GET|POST /api/providers` and `GET|PUT|PATCH|DELETE /api/providers/:id` — AI provider CRUD
- `PUT /api/providers/:id/active` — select the default provider
- `GET /api/inference/providers/:id/models` — list models through the provider
- `POST /api/inference/providers/:id/chat/completions` — Chat Completions proxy
- `POST /api/inference/providers/:id/responses` — Responses API proxy
- `ws://127.0.0.1:1234/:room` — Yjs collaboration using `@y/websocket-server`

Set `WEBWRITER_DEV_PORT` to use another port. `WEBWRITER_DEV_HOST` accepts only `127.0.0.1`, `::1`, or `localhost`.

## HTML editing capability coverage

The authoritative editing-support inventory is
[`src/html-element-capabilities.ts`](src/html-element-capabilities.ts). It tracks every conforming entry in the
WHATWG HTML Living Standard element index, including MathML, SVG, and autonomous custom elements, without acting as
an editor schema. Each entry records its overall support, visual insertion path, content/attribute/structure support,
intentional restrictions, owning feature, and a short user-facing explanation.

The support totals and remaining gaps are recorded in
[`src/html-element-capabilities.test.ts`](src/html-element-capabilities.test.ts).
Those checks require complete coverage and keep the manifest aligned with built-in insertion and intentional-limitation policies.

## Offline HTML

Offline export embeds media, stylesheets, imported CSS and its assets, and standalone scripts. For widget scripts, it loads `esbuild-wasm` on demand and bundles the required widget modules and their mapped dependencies in a worker, leaving out unused modules of packages that declare `"sideEffects": false` (or files outside their `sideEffects` patterns). Original package entry URLs are restored when an offline document is reopened for editing. Authored module dependency graphs, imports that cannot be resolved statically, embedded iframe documents, and arbitrary network requests made by widgets remain outside this export path and produce an error when detected.

## Shared widget dependencies

Before any widget script runs, the editor links the scripts of all installed packages into one import map with the JSPM generator, installs it in the iframe, and stores the resulting exact URLs for the installed package set. Bare imports resolve on jsDelivr within the ranges of the packages' `dependencies` and `peerDependencies`, and compatible versions are shared between packages. Versions are looked up on jsDelivr's data API or the npm registry; jspm.io is not used. Fully bundled scripts contribute no mappings, so existing packages load unchanged. A script that cannot be linked is left out of the map instead of blocking the others. Installing another package retains compatible resolutions. Each package catalog fetch, including **Refresh list** in search, silently checks for newer versions allowed by the publishers' ranges and reloads the iframe only if the map changes. HTML export includes the exact import map for standalone playback; offline export bundles the selected modules. The editor does not trust import maps supplied by opened HTML files as package-loader input.

jsDelivr is the canonical CDN: maps, package metadata and exports use its URLs. When jsDelivr fails, throttles or does not answer within 8 seconds, the frames' service worker and the package registry fetch the same npm file from unpkg, jsDelivr's other networks or raw.esm.sh, and keep the jsDelivr URL, so import-map scopes and relative imports are unchanged. When jsDelivr is unreachable while linking, the map is linked on the first reachable mirror and mapped back to jsDelivr. Exported HTML documents load from jsDelivr directly.

Import maps resolve JavaScript modules only. Export widget CSS separately, for example with a `"./widgets/my-widget.*"` export whose target provides both `my-widget.js` and `my-widget.css`. The editor loads that stylesheet in the live frame, preview, and HTML export; offline export embeds it. A widget using Shoelace components must provide its theme CSS rather than relying on another installed widget's stylesheet. [`@webwriter/build`](docs/widgets/reference/build-test.md) builds widget scripts that share dependencies this way, and prebuilds those that cannot or should not be shared.

## Formula editing

Insert **Formula**, then type directly in the formula or use the **Formula** edit toolbox. Existing native MathML formulas can be edited by clicking their contents. See [Formula editing](docs/formula-editing.md) for shortcuts and supported structures.

## Scoped widget data

Widgets opt in through `sharedData: true` in their package editing-config entry.
Keep settings in attributes and persistent interaction state in one direct child
data block:

```html
<ww-exercise id="exercise-a" shared="group">
  <script type="application/json" slot="data">{"answers":{}}</script>
</ww-exercise>
```

Without `shared`, data belongs to the current user; `shared` (an empty value)
shares with everyone in the document; `shared="group"` uses the authenticated
user's server-assigned group. This is an enumerated attribute: `shared="false"`
is invalid. Unknown modes report `dataerror`. Scope changes retain the old
scope's persisted state and load the destination; they never copy participant
answers into another scope. An unused scope starts with the authored defaults.

Widget code reads and writes `script.textContent` and listens for the bubbling
`datachange` event on that script or its host. Its `detail.mode` identifies the
active scope. Initial delivery and subsequent local/remote changes are notified
after a complete snapshot has been installed. Treat the block as unavailable
until its initial `datachange` when connecting to a server: writes during initial
connection are discarded. Invalid data reports a bubbling `dataerror` with
`detail.message` and leaves the last accepted shared value intact. Widget
observers should render shared state without writing it back as a side effect.
Transient UI state remains in widget properties or shadow DOM.

JSON objects merge recursively by property; scalar values and arrays are atomic
assignments. Strings are atomic, not collaborative text. Conflicting writes to
one value converge to Yjs's chosen winner; numeric assignments do not implement
an additive counter. An empty JSON block starts with `{}`. JSON property names,
including `__proto__`, remain data. `application/xml` is also supported: root
attributes merge separately; ordered child lists are atomic replacements.
Namespaces, comments, and processing instructions are preserved. XML must be
well formed and cannot contain a closing `script` tag inside an HTML data block.

The document runtime owns all connections. `POST /api/widget-data/resolve` accepts
`{document, widget, mode, format, documentRoom?, groupingRevision?}` and returns an opaque `{room, token}` for the
WebSocket provider. The development server's `resolveWidgetDataIdentity(request,
scope)` option must authorize the requested document/widget and return
`{userId, groupId?}`, optionally with `namespaceId` and `sessionId`. Client-supplied
user/group IDs are ignored. The default loopback server identifies everyone as
`local-development` and has no group assignment; applications supply their own
trusted identity resolver. Network state persists under `.webwriter-dev/widget-data/`.

The toolbox Share switch exposes grouping rules for widgets with `sharedData: true`.
Rules live in a native direct-child processing instruction (`ww-grouping`,
percent-encoded JSON), synchronized with the authored document and preserved in
HTML exports/imports. The server reads this declaration from `documentRoom`,
never from caller-supplied rules. `groupingRevision` prevents resolving stale rules.
`resolveWidgetGroupingContext(request, {document, widget, documentRoom, identity})`
supplies trusted participants, roles, cohorts, groups and groupings; `canManage: true`
permits roster access through `GET /api/widget-grouping/context`. Its default is a
single local developer. Automatic allocation, manual membership and existing
groupings use this roster; generated definitions persist under
`.webwriter-dev/widget-grouping/`. The optional `onWidgetGroupsFormed(request,
{document, widget, identity, rules, result})` hook can integrate a provider's group
catalogue, including the declared group messaging setting. Reconfigured rules or
changed membership get isolated data rooms. Turning Share off keeps the rules;
removing grouping returns the widget to everyone sharing.

For offline use, pass `widgetData: {documentId, userId}` to `DOMEditor` for stable
local-storage scopes. Otherwise each editor gets a distinct document identity,
retained in editor snapshots across iframe replacement. Without storage access,
state remains in memory. Group
mode requires a resolver. A custom `widgetData.resolve(scope)` can return
`{doc, ready?, destroy?}` to reuse an application's authorized Yjs transport;
`ready` must resolve once the existing scope has loaded. The resolver owns
identity and group routing. `destroy` releases its connection when the binding
ends. Widgets with copied IDs receive fresh identities and authored defaults.

Participant payloads are excluded from the shared body mirror and normal HTML
exports and clipboard copies, which retain authored defaults. Explicit snapshots
use `editor.toHTML(false, true, "current")` or
`editor.serializeHTML(false, "current")`. Scoped data edits participate in
undo/redo; scoped persistence survives normal editor snapshots/iframe replacement
through the server or local storage. No additional dependencies are required.
