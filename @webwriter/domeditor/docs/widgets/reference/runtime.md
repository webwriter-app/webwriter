# B1. Runtime interface

A widget script defines the [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) for its export. For example, `./widgets/ww-quiz.js` defines `ww-quiz`.

The widget class extends `HTMLElement` or a compatible class such as [`LitElementWw`](lit.md#litelementww).

| Interface | Purpose |
|---|---|
| `constructor()` | Creates shadow DOM and local state. The widget reads authored child content after connection. |
| `connectedCallback()` | Starts observers and external event listeners. The browser can call it more than once. |
| `disconnectedCallback()` | Stops observers and removes external event listeners. |
| `static observedAttributes` | Names of attributes that cause a call to `attributeChangedCallback` when they change. |
| `attributeChangedCallback(name, oldValue, value)` | Receives local, remote, and undo changes to observed attributes. |
| `isContentEditable` | Indicates whether a user can edit the widget. |
| `focus(options?)` | Can move focus to a control in the widget. |
| `static options` / `options` | [Option declarations](options-actions.md) for the Widget drawer. |
| `static actions` / `actions` | [Action declarations](options-actions.md). Each action has a method with the same name. |
| `static effects` / `effects`, `signals` | [Reactive links](#signals) between authored widgets. |
| `static convertFrom` / `convertFrom`, `static convertTo` / `convertTo` | [DOM conversions and file import or export](../guides/conversions.md). |
| `static aggregate` | [Aggregated View](aggregated-view.md) declaration for aggregate views. |
| `static offlineImports(element)` | [Select optional dynamic imports](#offline-imports) for Offline HTML. |

The authoring tool gives an installed widget a persistent `id` if the widget has none. During editing, the authoring tool adds `contenteditable=""` to widgets that have no `contenteditable` attribute. The authoring tool saves and shares authored values such as `contenteditable="false"`. The authoring tool omits its temporary value from saved and shared HTML.

The authoring tool handles shadow DOM events of the types in `propagateEvents`. The authoring tool also synchronizes changes that the widget makes to the authored DOM.

## Signals

Widgets can publish signals. Other widgets can read these signals and respond to changes.

Declare one entry in `static effects` for each supported lowercase effect attribute. Each entry needs a `connect(signal, lifetime)` callback. It can also have a localized `label` and `description`. The authoring tool calls `connect` with the receiving widget as `this`. The `lifetime` argument is an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). Clear the source when the signal aborts.

The source widget's `signals` object maps public names to read-only signals with a `get()` method. Keep these signal instances stable.

An effect attribute uses CSS selector syntax, such as `#sensor[celsius]`. The ID identifies one source widget in the document. The name in brackets identifies a public signal in `source.signals`.

The authoring tool keeps unresolved or circular links in the HTML. The authoring tool connects these links when the connections become valid.

The [Make data reactive guide](../guides/reactivity.md) includes a working example. [Lit signals](lit.md#signals) describes the Lit interface and the shared dependency requirements.

## Offline imports

The optional `offlineImports` method limits the code in an Offline HTML export. It returns its result synchronously.

The authoring tool passes a detached copy of each authored widget element. This includes widgets in HTML templates and templates that readers can insert. Read the attributes or child content of the copy. Keep the copy unchanged. Include all choices that a reader can use offline.

```js
static offlineImports(element) {
  const engine = element.getAttribute("engine") ?? "basic"
  return [{importer: "./engine-loaders.js", keep: [`./engines/${engine}.js`]}]
}
```

`importer` identifies the module with the [`import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) calls. Use a path relative to the widget entry module or an absolute HTTP(S) URL. If widgets share a loader module, declare the requirements for that loader in each widget.

`keep` lists the specifiers exactly as they appear in the module's `import()` calls. An empty list excludes all targets. `"*"` keeps all targets. The authoring tool combines the lists for the same importer across all widget instances. `"*"` has priority.

The authoring tool bundles the selected imports and their dependencies. In the standalone file, an excluded call rejects with `OfflineImportError`. The usual bundle rules apply to static imports and to dynamic imports from modules without an `offlineImports` rule.

[Manage dependencies](../guides/libraries.md#optimize-the-code-bundle) gives a loader example and steps to test the export.

## Conversions

Each key identifies a format and specifies what the handler receives or returns. The import and export maps are independent. A conversion can keep only the content that the target format can represent.

| Key | `convertFrom` | `convertTo` |
|---|---|---|
| Lowercase native HTML tag, such as `ul` | Receives a detached `DocumentFragment` with a copy of the source element. Sets the content of the new widget synchronously. Returns nothing or `true` for success. Returns `false` to decline. | Returns a detached element or a detached fragment with one or more sibling elements. Each element uses the declared tag. The fragment can contain comments and formatting whitespace. Returns `null` to decline. |
| Extension such as `.h5p` or concrete media type such as `image/png` | Receives one `File`. Returns a synchronous function that applies the prepared content to the existing widget. Returns `null` or `false` to decline. Can prepare its result asynchronously. | Returns a `File` with a matching extension or media type. Returns `null` or `false` to decline. Can return a promise. |

Use method names or function references. The authoring tool calls the handlers with the widget as `this`. An instance map has priority over a static map. Use `static convertFrom` to declare the DOM tags that a new widget accepts.

The authoring tool checks that the replacement is valid at the source location. For a file import, the authoring tool checks the format and confirms that the original widget can still receive the result. Apply authored changes only in the function that the file handler returns. The authoring tool records these changes as one undo step.

An export handler reads the widget state and returns the result for download. A file handler has ten seconds to return its result. The [conversion guide](../guides/conversions.md) gives examples.

## Scoped custom element registries

Widget documents require a browser with native scoped custom element registries. Create the registry with [`new CustomElementRegistry()`](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/CustomElementRegistry). Attach the shadow root with `attachShadow({mode: "open", customElementRegistry: registry})`.

Older widget packages can use the legacy interfaces in the table when the authoring tool provides compatibility support.

| Legacy API | Native operation |
|---|---|
| `attachShadow({customElements: registry})` or `{registry}` | `attachShadow({customElementRegistry: registry})` |
| `shadowRoot.customElements` or `.registry` | Read `shadowRoot.customElementRegistry` |
| `shadowRoot.createElement()` / `.createElementNS()` | Owning document's creation method with the root's registry |
| `shadowRoot.importNode(node, deep)` | Owning document's `importNode(node, {customElementRegistry, selfOnly: !deep})` |

The native `customElementRegistry` option has priority over the legacy options. Registry aliases are read-only. The browser applies its standard registry rules.

Remove `@webcomponents/scoped-custom-element-registry` from the widget's imports and dependencies. Use the native interfaces in new standalone widgets. If a standalone page uses legacy widgets, load a compatibility adapter before their modules.
