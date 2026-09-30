# Widget packages

What a widget package needs to work in the domeditor, and what it can configure.

## Minimal widget

```jsonc
// package.json
{
  "name": "@webwriter/hello",
  "version": "1.0.0",
  "keywords": ["webwriter-widget"],
  "exports": {"./widgets/ww-hello.js": "./ww-hello.js"}
}
```

```js
// ww-hello.js
class WwHello extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = "<p>Hello, <slot></slot>!</p>"
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
```

Required:

- a scoped `name` (`@webwriter/…`) and a SemVer `version`;
- the keyword `webwriter-widget`;
- one `./widgets/<tag-name>.js` export whose script defines `<tag-name>`.

Publish it to npm and `<ww-hello>` appears in the insertion menu. To try a package before publishing, open its folder in the Develop toolbox.

Everything below is optional.

## `package.json` fields

| Field | Use |
|---|---|
| `name`, `version` | Required. Package identity. |
| `exports` | Package members, see below. |
| `editingConfig` | How members behave in the editor, see Editing config. Deep-merged over `./editing-config.json`; inline wins. |
| `dependencies`, `peerDependencies` | Packages the widgets import by bare specifier, shared between widget packages. |
| `prebuiltDependencies` | Dependencies bundled into the package instead of shared, see Building. |
| `description`, `keywords`, `author`, `contributors`, `license`, `homepage`, `repository` | Shown on the package card. |
| `customElements` | Path to a custom elements manifest. |

A `README.md` (or `.markdown`, `.txt`) is shown to users and to the AI assistant.

Export targets may be strings or condition objects (`browser`, `import`, `default`, in that order). `source` points the Develop toolbox and `@webwriter/build` to the source file.

## Exports

| Key | Target | Effect |
|---|---|---|
| `./widgets/<tag-name>.*` | `path/<tag-name>.*` | Widget with script `<path>.js` and, if published, stylesheet `<path>.css`. |
| `./widgets/<tag-name>.js`, `./widgets/<tag-name>` | `path/file.js` | Widget script. |
| `./widgets/<tag-name>.css` | `path/file.css` | Widget stylesheet. Overrides one from `.*`. |
| `./snippets/<name>.html` | `path/file.html` | Insertable HTML. Active content (scripts, event handlers, styles) is removed. |
| `./icon` | `path/icon.svg` | Package and member icon. |
| `./editing-config.json` | `path/file.json` | Editing config in a separate file. |
| `./migrate.js` | `path/file.js` | Updates content from older versions, see Migrations. |
| `./tests/<name>.*`, `./tests/<name>.js` | `path/file.*` | Tests, run from the Develop toolbox. |
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
| `sharedData` | `boolean` | `false` | Enables scoped, persistent state in a direct `script[slot="data"]` child. |

`LocalizedText`: a string or `{"en": "…", "de": "…", "_": "fallback"}`. Matches the exact locale, then the language, then `_`.

Content expressions: node names (`p`, `ww-option`) and groups (`flow`, `phrasing`, `heading`, `widget`, `widgetinline`, custom groups); `a b` sequence, `a | b` choice, `(…)` grouping, `?`, `*`, `+`, `{n}`, `{n,}`, `{n,m}`. Children with `contenteditable="false"` are always allowed.

## Widget script

| To | Do |
|---|---|
| Save settings | Reflect them to attributes. Authored attributes and light-DOM children are saved, shared and undoable. |
| Persist interaction state | Use scoped widget data below. Properties and shadow DOM remain local and are not saved. |
| Keep UI out of the document | Render it in the shadow DOM. Its events do not reach the editor, except `propagateEvents`. |
| Tell editing from use | `:host([contenteditable])` in CSS, `this.isContentEditable` in script. |
| React to changes | `attributeChangedCallback` or a `MutationObserver`; changes may come from the editor, collaborators or undo. |
| Follow the document language | Read `lang` from the nearest ancestor with `lang` and watch it for changes. |
| Adapt to printing | `@media print`, `beforeprint` and `afterprint`. |
| Keep an element out of saved HTML | Mark it `data-webwriter-editor-only`. |

`contenteditable`, `spellcheck` and classes starting with `◆` belong to the editor and are never saved.

### Scoped widget data

Set `sharedData: true` in the widget's editing-config entry and provide one direct data block, with defaults and no `src`:

```html
<ww-quiz shared="group">
  <script type="application/json" slot="data">{"answers":{}}</script>
</ww-quiz>
```

Use `application/json` or `application/xml`. Read/write `script.textContent`; listen for bubbling `datachange` on the block or widget to render accepted local changes and remote merges. Wait for the initial event before writing. Invalid data emits `dataerror` (`detail.message`) without changing persisted state. The document runtime handles networking, persistence and undo.

No `shared` means individual data; `shared` means everyone; `shared="group"` uses the server-assigned group. Switching loads the destination's existing state or defaults, without copying answers. JSON object fields merge recursively; scalars and arrays are replaced atomically. XML root attributes merge separately; child lists are replaced atomically. Normal exports retain defaults, not participant answers. Keep temporary UI state in properties/shadow DOM.

The toolbox’s **Share** switch sets `shared`; its grouping dialog saves a direct `<?ww-grouping …?>` child with encoded JSON rules. The server assigns participants from its trusted roster. Treat this instruction as opaque metadata and preserve it when updating widget children. Turning Share off retains the rules; removing the grouping returns to everyone sharing.

### Options and actions

Declare them on the class (`static options`, `static actions`) or the instance (`options`, `actions`) and the Widget drawer offers them for the selected widget.

| Declaration | Fields |
|---|---|
| Option | `type` (`Boolean`, `String`, `Number`, `Object`, `Array`, or `"boolean"`, `"string"`, `"number"`, `"date"`, `"datetime-local"`, `"email"`, `"password"`, `"tel"`, `"time"`, `"url"`, `"color"`, `"select"`, `"object"`, `"array"`), `attribute` (name or `false`), `label`, `description`, `placeholder`, `multiline`, `min`, `max`, `step`, `pattern`, `minlength`, `maxlength`, `swatches`, `multiple`, `options` (`[{value, label, description}]`) |
| Action | `label`, `description` |

An option is written to its attribute (default: lowercased name) as Lit reads it: booleans as presence, objects, arrays and multiple selections as JSON. With `attribute: false` it sets the property and is not saved. An action is a method of the same name; its changes are undone in one step.

## Dependencies and building

Import dependencies by bare specifier (`import {LitElement} from "lit"`) and declare them in `dependencies`. Compatible versions are shared by all widget packages in a document.

Build with `@webwriter/build` (`npx @webwriter/build`, `dev` for development, `preview <tag-name>` to serve one widget). It bundles the `./widgets/*` exports from their `source` and keeps dependencies as bare imports.

| Dependency | Built as |
|---|---|
| Shared (default) | Left to the import map. |
| Prebuilt | Bundled into the package. Required for packages not usable in the browser as published (e.g. CommonJS); proposed for packages loading ≥ 200 modules. |
| Declaring `"sideEffects": false` | Only the modules actually imported are loaded, in the editor and in saved documents. For other packages, the build suggests narrower imports when they would halve the modules loaded. |

| Option | Effect |
|---|---|
| `prebuiltDependencies` | Declares the prebuilt dependencies. Without it, the build proposes them and saves the confirmed answer. |
| `--yes` | Confirms the proposal. |
| `--prebuild-threshold=<modules>` | Changes the threshold (default 200) and proposes again. |

## Migrations

Export `./migrate.js` to update content from an older package version when it is pasted, dropped or inserted from a snippet. Listen for `migrate` on `document` and update or replace `event.target`; `event.detail` holds `{packageName, version}` of the installed version, so read the old version from the element. The script runs in a sandbox, not in the document, and must finish within 3 s.

## Tests

Export `./tests/<name>.*` modules written with `@webwriter/build/test` and run them from the Develop toolbox (max. 60 s).

## Snippet translations

Run `@webwriter/build localize` to add translations to snippets. The document language selects them on insertion.

## Develop checks

The Develop toolbox reports unknown or invalid editing-config options, config keys matching no export, invalid tag names and content expressions, widgets their script does not define, and Lit properties that are not reflected to attributes (not saved).

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
  "dependencies": {"lit": "^3.0.0", "@shoelace-style/shoelace": "^2.20.0", "drawflow": "^0.0.60"},
  "prebuiltDependencies": ["drawflow"],         // CommonJS: bundled, not shared
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
      "label": {"en": "Quiz", "de": "Quiz"}      // package label
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
