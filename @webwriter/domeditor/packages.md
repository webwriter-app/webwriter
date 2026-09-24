# Widget packages

The interface between a widget package and the domeditor.

## Discovery

- npm name scoped `@webwriter/…`, `keywords` includes `webwriter-widget`.
- Loaded from jsDelivr at the exact published version (`cdn.jsdelivr.net/npm/<name>@<version>/<path>`).
- Local packages (Develop toolbox) require a scoped `name` and a SemVer `version`.
- README (`README.md`, `.markdown`, `.txt`) is shown to users and to the AI (`list_widgets`).

## `package.json` fields

| Field | Use |
|---|---|
| `name`, `version` | Required. Package identity and CDN path. |
| `exports` | Package members, see below. |
| `editingConfig` | Inline editing config. Deep-merged over `./editing-config.json`; inline wins. |
| `description`, `keywords`, `author`, `contributors`, `license`, `homepage`, `repository` | Package card metadata. |
| `customElements` | Path to a custom elements manifest. Metadata only. |

Export targets may be strings or condition objects. Resolution order: `browser` → `import` → `default`. `source` is the Develop toolbox's source path.

## Exports

| Key | Target | Effect |
|---|---|---|
| `./widgets/<tag-name>.*` | `path/<tag-name>.*` | Loads `<path>.js` (module) and `<path>.css` if published. Tag name = key basename. |
| `./widgets/<tag-name>.js` | `path/file.js` | Loads the script only. |
| `./snippets/<name>.html` | `path/file.html` | Insertable HTML. Active content is stripped before insertion. |
| `./icon` | `path/icon.svg` | Package and member icon. |
| `./editing-config.json` | `path/file.json` | External editing config. |
| `./themes/<name>.html` | | Listed in the Develop toolbox. |
| `./tests/<name>.*` | | Listed in the Develop toolbox. |
| `./migrate.js` | | Listed in the Develop toolbox. |
| `./custom-elements.json` | | Listed in the Develop toolbox. |

## Editing config

Keyed by export name without extension (`./widgets/ww-quiz`). Key `.` applies to the package.

| Option | Type | Default | Effect |
|---|---|---|---|
| `label` | `LocalizedText` | Title-cased name | Menu label. On `.`: package label. |
| `description` | `LocalizedText` | | Menu description. On `.`: package description. |
| `uninsertable` | `boolean` | `false` | Hides the member from the insertion menu. |
| `group` | `string` | `"flow"` | Space-separated schema groups. `widget` or `widgetinline` is always added. |
| `inline` | `boolean` | `false` | Phrasing widget (`widgetinline`), not added to `flow`. |
| `content` | `string` | none (atomic) | Content expression for light-DOM children. Without it the widget is one atomic node. |
| `isolating` | `boolean` | `true` | Editing does not split or join across the widget boundary. |
| `moduleResolution` | `"import-map"` | | On `.` only. Bare imports in unbundled ESM widgets resolve via one shared import map (jspm). Omit for bundled widgets. |

`LocalizedText`: a string or `{"en": "…", "de": "…", "_": "fallback"}`. Matches the exact locale, then the language, then `_`.

Content expressions: node names (`p`, `ww-option`) and groups (`flow`, `phrasing`, `heading`, `widget`, `widgetinline`, custom groups); `a b` sequence, `a | b` choice, `(…)` grouping, `?`, `*`, `+`, `{n}`, `{n,}`, `{n,m}`.

## Runtime

- Package scripts and styles load in the editor frame as `<script type="module">` / `<link>` with the frame nonce. Exports include them only if the document uses their tag.
- Document state is the light DOM: attributes and children are saved, synchronized and undone. Shadow DOM and properties are not.
- Events inside the widget's shadow DOM are ignored by the editor. Changes to light-DOM attributes or children are observed.
- Elements with `contenteditable="false"` always satisfy content expressions.
- `contenteditable`, `spellcheck`, `data-webwriter-editor-only` and classes starting with `◆` are editor-only and excluded from saved HTML.
- The editor body is `contenteditable`; in preview and export it is not. Use `this.isContentEditable` to detect edit mode.

## `package.json` example

```jsonc
{
  "name": "@webwriter/quiz",                     // scoped name
  "version": "1.2.0",                            // exact SemVer
  "description": "Multiple-choice questions.",
  "keywords": [
    "webwriter-widget",                          // required for discovery
    "widget-practical",                          // Practice
    "widget-lang-en",                            // content language
    "isced2011-2",                               // ISCED 2011 education level
    "iscedf2013-05"                              // ISCED-F 2013 field
  ],
  "author": "Jane Doe",
  "license": "MIT",
  "dependencies": {"lit": "^3.0.0"},
  "exports": {
    "./widgets/ww-quiz.*": {                     // defines <ww-quiz>
      "source": "./src/widgets/ww-quiz.ts",      // Develop toolbox source
      "default": "./dist/widgets/ww-quiz.*"      // loads .js and .css
    },
    "./widgets/ww-option.*": "./dist/widgets/ww-option.*",
    "./snippets/true-false.html": "./snippets/true-false.html",
    "./icon": "./icon.svg",
    "./editing-config.json": "./editing-config.json"
  },
  "editingConfig": {
    ".": {
      "label": {"en": "Quiz", "de": "Quiz"},     // package label
      "moduleResolution": "import-map"           // only for unbundled ESM
    },
    "./widgets/ww-quiz": {
      "label": {"_": "Quiz", "de": "Quiz"},
      "description": "A question with options.",
      "content": "p+ ww-option{2,}"             // editable children
    },
    "./widgets/ww-option": {
      "uninsertable": true,                      // only inside ww-quiz
      "group": "quizoption",
      "content": "phrasing*"
    }
  }
}
```

Standard keywords: `widget-online`, `widget-online-edit`, `widget-online-use`, `widget-presentational`, `widget-practical`, `widget-simulational`, `widget-conceptual`, `widget-informational`, `widget-contextual`, `widget-lang-<bcp47>`, `isced2011-<0–9>`, `iscedf2013-<code>`.

## `widget.js` example

```js
// dist/widgets/ww-quiz.js — tag name must match the export key
class WwQuiz extends HTMLElement {
  static observedAttributes = ["answer"]         // state lives in attributes

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <slot></slot>                              <!-- light-DOM content (editingConfig.content) -->
      <button part="check">Check</button>`       // widget UI stays in shadow DOM
    this.shadowRoot.querySelector("button")
      .addEventListener("click", () => this.check()) // ignored by the editor
  }

  get answer() { return this.getAttribute("answer") }
  set answer(value) { this.setAttribute("answer", value) } // saved, synced, undoable

  check() {
    if(this.isContentEditable) return            // editing, not in use
    const chosen = this.querySelector("ww-option[checked]")
    this.toggleAttribute("data-correct", chosen?.id === this.answer)
  }

  attributeChangedCallback() {
    // May be triggered by the editor, a collaborator, or undo.
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
```
