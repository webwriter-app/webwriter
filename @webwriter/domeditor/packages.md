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
| `./widgets/<tag-name>.js`, `./widgets/<tag-name>` | `path/file.js` | Loads the widget's script. |
| `./widgets/<tag-name>.css` | `path/file.css` | Loads the widget's stylesheet. Takes precedence over one inferred from `.*`. |
| `./snippets/<name>.html` | `path/file.html` | Insertable HTML, translated to the document language. Active content is stripped. |
| `./icon` | `path/icon.svg` | Package and member icon. |
| `./editing-config.json` | `path/file.json` | External editing config. |
| `./migrate.js` | `path/file.js` | Migration of inserted content, see Runtime. |
| `./tests/<name>.*`, `./tests/<name>.js` | `path/file.*` | Test module, run from the Develop toolbox. |
| `./themes/<name>.html` | | Listed in the Develop toolbox. |
| `./custom-elements.json` | | Listed in the Develop toolbox. |

Exports of one tag (`.js`, `.css`, `.*`) form one widget.

## Editing config

Keyed by export name with or without extension (`./widgets/ww-quiz`, `./widgets/ww-quiz.*`). Key `.` applies to the package.

| Option | Type | Default | Effect |
|---|---|---|---|
| `label` | `LocalizedText` | Title-cased name | Menu label. On `.`: package label. |
| `description` | `LocalizedText` | | Menu description. On `.`: package description. |
| `uninsertable` | `boolean` | `false` | Hides the member from the insertion menu. |
| `group` | `string` | `"flow"` | Space-separated schema groups. `widget` or `widgetinline` is always added. |
| `inline` | `boolean` | `false` | Phrasing widget (`widgetinline`), not added to `flow`. |
| `content` | `string` | none (atomic) | Content expression for light-DOM children. Without it the widget is one atomic node. |
| `isolating` | `boolean` | `true` | Editing does not split or join across the widget boundary. |
| `marks` | `string` | `"_"` | Space-separated marks formatting commands may apply in the content (`b i a`, `span` for text styles); `""` none, `"_"` all. |
| `propagateEvents` | `string[]` | `[]` | Event types from the widget's shadow DOM that the editor still handles, e.g. `["keydown"]` for shortcuts. |
| `moduleResolution` | `"import-map"` | | On `.` only. Bare imports in unbundled ESM widgets resolve via one shared import map (jspm). Omit for bundled widgets. |

`LocalizedText`: a string or `{"en": "…", "de": "…", "_": "fallback"}`. Matches the exact locale, then the language, then `_`.

Content expressions: node names (`p`, `ww-option`) and groups (`flow`, `phrasing`, `heading`, `widget`, `widgetinline`, custom groups); `a b` sequence, `a | b` choice, `(…)` grouping, `?`, `*`, `+`, `{n}`, `{n,}`, `{n,m}`.

## Runtime

- Package scripts and styles load in the editor frame as `<script type="module">` / `<link>` with the frame nonce. Exports include them only if the document uses their tag.
- Document state is the light DOM: attributes and children are saved, synchronized and undone. Shadow DOM and properties are not.
- Data containers: `<script>` children of a widget with a non-JavaScript MIME type (e.g. `application/json`) and no `src`. Kept under any content model and when copied or pasted.
- While editing, the editor sets `contenteditable=""` on each widget without its own `contenteditable`. Preview and export omit it. Use `:host([contenteditable])` or `this.isContentEditable`.
- `lang` is inherited from the nearest ancestor with `lang`. Watch ancestors for changes to the document language.
- Printing: use `@media print` and the `beforeprint` / `afterprint` window events.
- Events inside the widget's shadow DOM are ignored by the editor, except `propagateEvents`. Changes to light-DOM attributes or children are observed.
- Elements with `contenteditable="false"` always satisfy content expressions.
- `contenteditable`, `spellcheck`, `data-webwriter-editor-only` and classes starting with `◆` are editor-only and excluded from saved HTML.

### Options and actions

The Widget drawer edits the selected widget's declared options and runs its actions. Declarations are read from the instance (`widget.options`, `widget.actions`), else from the class (`static options`, `static actions`).

| Declaration | Fields |
|---|---|
| Option | `type` (`Boolean`, `String`, `Number`, `Object`, `Array`, or `"boolean"`, `"string"`, `"number"`, `"date"`, `"datetime-local"`, `"email"`, `"password"`, `"tel"`, `"time"`, `"url"`, `"color"`, `"select"`, `"object"`, `"array"`), `attribute` (name or `false`), `label`, `description`, `placeholder`, `multiline`, `min`, `max`, `step`, `pattern`, `minlength`, `maxlength`, `swatches`, `multiple`, `options` (`[{value, label, description}]`) |
| Action | `label`, `description` |

- An option is written to its attribute (default: lowercased name) as Lit's converters read it: booleans as presence, objects, arrays and multiple selections as JSON. `attribute: false` sets the property.
- An action is a method; its DOM changes form one undo step (async: until settled, max. 10 s).

### Migrations

`./migrate.js` is a module that listens for `migrate` events on `document`. Before inserting pasted, dropped or snippet content, the editor runs it in an opaque-origin sandbox on each outermost widget of the package and dispatches `migrate` on every widget of the package, with `event.detail = {packageName, version}` (installed version). The listener updates or replaces `event.target`; the source version must be read from the element. Results are discarded after an error, after 3 s, or if no element remains.

### Tests

A `./tests/*` module runs in a separate frame and reports through `test-update` window events (`@webwriter/build/test`): `beforeAll`, `beforeOne`, `afterOne` (`id`, `path`, `passed`, `duration`, `timedOut`), `afterAll`. Runs stop after 60 s.

### Snippet translations

`<script type="application/json" class="snippet-localization">` maps `<trimmed text>#<occurrence>` to `{<locale>: <translation>}` for the snippet's text outside MathML (written by `@webwriter/build localize`). The document language selects the translation; the script is removed on insertion.

### Develop checks

Local packages are checked for unknown or invalid editing-config options, config keys matching no export, invalid tag names and content expressions, widgets their script does not define, and Lit properties that read an attribute without reflecting changes back (not saved).

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
    "./widgets/ww-option.js": "./dist/widgets/ww-option.js",
    "./widgets/ww-option.css": "./dist/widgets/ww-option.css",
    "./snippets/true-false.html": "./snippets/true-false.html",
    "./migrate.js": "./dist/migrate.js",
    "./tests/basics.*": "./dist/tests/basics.*",
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
      "content": "p+ ww-option{2,}",             // editable children
      "marks": "b i sub sup",                    // allowed formatting
      "propagateEvents": ["keydown"]             // editor shortcuts work inside
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
  static observedAttributes = ["answer", "contenteditable"]

  static options = {                             // Widget drawer fields
    answer: {type: String, label: {_: "Answer", de: "Antwort"}},
    shuffled: {type: Boolean, label: {_: "Shuffle options"}},
  }
  static actions = {reset: {label: {_: "Reset"}}}

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <style>:host([contenteditable]) button { display: none }</style>
      <slot></slot>                              <!-- light-DOM content (editingConfig.content) -->
      <button part="check">Check</button>`       // widget UI stays in shadow DOM
    this.shadowRoot.querySelector("button")
      .addEventListener("click", () => this.check()) // ignored by the editor
  }

  get answer() { return this.getAttribute("answer") }
  set answer(value) { this.setAttribute("answer", value) } // saved, synced, undoable

  get shuffled() { return this.hasAttribute("shuffled") }

  get state() {                                  // data container: saved with the widget
    return JSON.parse(this.querySelector(':scope > script[type="application/json"]')?.textContent ?? "{}")
  }

  reset() {                                      // action: one undo step
    this.removeAttribute("answer")
    this.removeAttribute("shuffled")
  }

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

## `migrate.js` example

```js
// dist/migrate.js — runs in a sandbox, never in the document
document.addEventListener("migrate", event => {
  const quiz = event.target
  if(quiz.localName !== "ww-quiz" || !quiz.hasAttribute("solution")) return
  quiz.setAttribute("answer", quiz.getAttribute("solution")) // 1.x → 2.x
  quiz.removeAttribute("solution")
})
```
