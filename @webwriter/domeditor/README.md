# DOMEditor development server

Run the editor and its localhost backend together:

```sh
npm start
```

The server listens on `http://127.0.0.1:1234` and refuses non-loopback bind addresses. It has no authentication and must never be exposed to a network. The editor probes `/api/session`, automatically signs in to this no-auth development session, and uses server documents and server-managed AI providers by default. Click **Local dev** in the ribbon to open the admin dashboard, or visit `http://127.0.0.1:1234/admin`.

Data is stored in the ignored `.webwriter-dev/` directory. Provider files have owner-only permissions, but API keys are still stored as plaintext development secrets. `OPENAI_API_KEY` can instead be set in `.env.local`; it creates an OpenAI provider whose key stays in the environment.

## Example lessons

[`examples/`](examples/) contains twelve editable HTML lessons. Open them in the editor or a browser; widget assets load online.

The [Mozilla MathML Test](examples/mozilla-mathml-test.html) is also bundled as a preset. Start or restart the dev server, then load **Mozilla MathML Test** from the server document list. It contains all 30 comparisons from [Frédéric Wang's test](https://fred-wang.github.io/MathFonts/mozilla_mathml_test/), with native MathML, a forced `math-style: compact` column, and online TeX reference images. The table extends beyond the normal content width to fit the comparisons. The font selector is omitted so rendering uses the browser's default math font. Saved edits survive restarts; deleting the preset restores the bundled version on the next server start.

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

Offline export embeds media, stylesheets, imported CSS and its assets, and standalone scripts. It preserves original resource URLs for reopening in the editor. Failed downloads, JavaScript module dependencies and embedded iframe documents produce a visible error; use regular HTML for those documents. Arbitrary network requests made by widget code are outside the resource export.

## Formula editing

Insert **Formula**, then type directly in the formula or use the **Formula** edit toolbox. Existing native MathML formulas can be edited by clicking their contents. See [Formula editing](docs/formula-editing.md) for shortcuts and supported structures.
