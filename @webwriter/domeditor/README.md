# DOMEditor development server

Run the editor and its localhost backend together:

```sh
npm start
```

The server listens on `http://127.0.0.1:1234` and refuses non-loopback bind addresses. It has no authentication and must never be exposed to a network. The editor probes `/api/session`, automatically signs in to this no-auth development session, and uses server documents and server-managed AI providers by default. Click **Local dev** in the ribbon to open the admin dashboard, or visit `http://127.0.0.1:1234/admin`.

Editor and preview iframes use the paired `localhost` origin in development. The app at `127.0.0.1` and the frames at `localhost` share the port but have different origins. For a deployed build, serve the same static files at a dedicated editor origin and set `VITE_APP_ORIGIN` and `VITE_EDITOR_ORIGIN` to the two exact HTTPS origins when building. The frame origin must serve `frame-shell.html`, `local-package-service-worker.js`, and the generated `assets/` files. Collaboration servers and widget asset hosts must also accept requests from the editor origin. Keep it separate from the application origin; the frames require both `allow-scripts` and `allow-same-origin` for native editing and widget support.

Data is stored in the ignored `.webwriter-dev/` directory. Provider files have owner-only permissions, but API keys are still stored as plaintext development secrets. `OPENAI_API_KEY` can instead be set in `.env.local`; it creates an OpenAI provider whose key stays in the environment.

## Example lessons

[`examples/`](examples/) contains twelve editable HTML lessons. Open them in the editor or a browser; widget assets load online.

The [Mozilla MathML Test](examples/mozilla-mathml-test.html) is also bundled as a preset. Start or restart the dev server, then load **Mozilla MathML Test** from the server document list. It contains all 30 comparisons from [Frédéric Wang's test](https://fred-wang.github.io/MathFonts/mozilla_mathml_test/), with native MathML, a forced `math-style: compact` column, and online TeX reference images. The table extends beyond the normal content width to fit the comparisons. The font selector is omitted so rendering uses the browser's default math font. Saved edits survive restarts; deleting the preset restores the bundled version on the next server start.

The [Kitchen Sink](examples/kitchen-sink.html) preset pairs empty and populated versions of every built-in insertable element using the two-column layout. Start or restart the dev server and select **Kitchen Sink** in the document list. Saved edits survive restarts; deleting the preset restores the bundled example on the next start. Only the sample video requires an internet connection.

## APIs

- `GET /api/session` — backend probe and no-auth login metadata
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

Import maps resolve JavaScript modules only. Export widget CSS separately, for example with a `"./widgets/my-widget.*"` export whose target provides both `my-widget.js` and `my-widget.css`. The editor loads that stylesheet in the live frame, preview, and HTML export; offline export embeds it. A widget using Shoelace components must provide its theme CSS rather than relying on another installed widget's stylesheet. [`@webwriter/build`](packages.md#building) builds widget scripts that share dependencies this way, and prebuilds those that cannot or should not be shared.

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
