# Runtime interface

A widget script defines the custom element named by its export, for example `./widgets/ww-quiz.js` defines `ww-quiz`. It can extend `HTMLElement` or a compatible library base class.

| Interface | Purpose |
|---|---|
| `constructor()` | Create shadow DOM and local state. Read authored children after connection. |
| `connectedCallback()` | Set up observers and external listeners. May run more than once. |
| `disconnectedCallback()` | Release observers and external listeners. |
| `static observedAttributes` | Attribute names that trigger `attributeChangedCallback`. |
| `attributeChangedCallback(name, oldValue, value)` | React to local, remote, and undo changes. |
| `isContentEditable` | Whether the widget is currently editable. |
| `focus(options?)` | Optionally delegate focus to an internal control. |
| `static options` / `options` | [Option declarations](options-actions.md) for the Widget drawer. |
| `static actions` / `actions` | [Action declarations](options-actions.md); methods have matching names. |
| `static convertFrom` / `convertFrom`, `static convertTo` / `convertTo` | [DOM conversions and file import or export](../guides/conversions.md). |
| `static aggregate` | [Aggregated View](aggregated-view.md) declaration for aggregate views. |
| `static offlineImports(element)` | [Select optional dynamic imports](#offline-imports) for Offline HTML. |

WebWriter gives installed widgets a persistent `id` if missing. It adds `contenteditable=""` while editing if the widget has no `contenteditable` attribute. The empty value on installed widgets is temporary and is excluded from saved and shared HTML. Explicit values such as `contenteditable="false"` are preserved.

Shadow-DOM events are ignored by editor features unless `propagateEvents` opts in. Deliberate widget changes to authored DOM are still observed and synchronized.

## Offline imports

Implement this optional synchronous hook to limit the code that Offline HTML embeds. WebWriter passes each widget's detached authored element, including instances in HTML templates and insertable reader templates. Read attributes or child content from this copy and leave it intact. Include every choice a reader can reach offline.

```js
static offlineImports(element) {
  const engine = element.getAttribute("engine") ?? "basic"
  return [{importer: "./engine-loaders.js", keep: [`./engines/${engine}.js`]}]
}
```

`importer` is the module containing the `import()` calls, given as a path relative to the widget entry module or an absolute HTTP(S) URL. Use a loader module owned by the widget or shared only with widgets that also declare their requirements for it. `keep` lists the specifiers exactly as they appear in that module's `import()` calls. An empty list keeps none of those calls' targets and `"*"` keeps all of them. WebWriter combines the lists for the same importer across all instances, with `"*"` taking precedence.

WebWriter bundles selected imports and their dependencies normally. Calls excluded by the hook reject with an error named `OfflineImportError` in the standalone file. Static imports and dynamic imports from importers without rules follow the ordinary bundling behavior.

See [Optimize the code bundle](../guides/optimize-code-bundle.md) for a loader example and offline verification steps.

## Conversions

The key identifies the format and determines the handler's contract. The two maps are independent. A conversion may preserve only the content its target format can represent.

| Key | `convertFrom` | `convertTo` |
|---|---|---|
| Lowercase native HTML tag, such as `ul` | Receives a detached `DocumentFragment` containing a copy of the source element. Populate the new widget synchronously. Return nothing or `true` on success, or `false` to decline. | Return a detached element with the declared tag, or a detached fragment containing one or more siblings with that tag. The fragment may include comments and formatting whitespace. Return `null` to decline. |
| Extension such as `.h5p` or concrete media type such as `image/png` | Receives one `File`. Return a synchronous function that applies the prepared content to the existing widget, or `null` or `false` to decline. The handler can prepare its result asynchronously. | Return a `File` with a matching extension or media type, or `null` or `false` to decline. The handler may return a promise. |

Use method names or function references. The editor calls the handlers with the widget as `this`. Instance maps override static maps. Prefer `static convertFrom` to advertise the DOM tags accepted by a fresh widget without constructing a probe. When only an instance map exists, the editor discovers DOM input keys on a detached default instance.

The editor validates DOM replacement at the source location. File imports validate the format key and recheck the original widget after preparation. Apply authored changes only in the returned function so the editor can commit them in one undo step. Export handlers read widget state and return the result for the editor to download. File handlers have ten seconds to return their result. See the [conversion guide](../guides/conversions.md) for examples.

## `LitElementWw`

Import from `@webwriter/lit`. Call `super` when overriding its lifecycle callbacks.

| Member | Purpose |
|---|---|
| `editable` | Getter for `isContentEditable`; updates when the widget or an ancestor changes editing mode. |
| `lang` | Reactive language, following the nearest ancestor unless explicitly set. |
| `static scopedElements` | Map of tag names to component classes in a native registry shared by instances of that concrete widget class. |
| `registry` | The widget class's native `CustomElementRegistry`. |
| `static properties` | Lit reactive property declarations; separate from WebWriter option metadata. |
| `static options` / `static actions` | Editor drawer declarations. No decorators are required or exported. |
| `localize` | Optional `{getLocale, setLocale}` connection from `@lit/localize`. |
| `static dataType` | Default inert data-block MIME type; initially undefined. |
| `dataType` | Current data-block type, falling back to the class default. |
| `data` | Raw text of the direct scoped block, otherwise the first direct inert script child without `src`, or `null`. Setting it uses `dataType` or `text/plain`. |
| `setData(type, value, attrs?)` | Creates or updates the block in place, preserving its identity and existing attributes. Rejects executable types, `src`, and unsafe closing script tags; JSON `<` characters are escaped. |
| `dataReady` | Whether the current data scope can be written. Loading or failed connections remain unavailable. |
| `dataPending(context)` | Override to show loading when a participant scope starts resolving. |
| `dataChanged(text, context)` | Override to consume initial, accepted local, remote, and undo/redo snapshots. Read without writing back. |
| `dataError(error, context)` | Override to display a connection or data validation error. |

Data hooks receive raw text and a `{block, mode}` context. Modes are `individual`, `all`, `group`, or `local`. Override these hooks instead of managing DOM event listeners. The base class requests current state on connection, including after a late custom-element upgrade, and ignores nested widgets' events. Writes through `data` or `setData()` throw `InvalidStateError` while a managed scope is pending. Validation errors on an already-ready scope allow a corrected write.

Scoped participant data still requires the [data-block contract](data.md): JSON or XML, `slot="data"`, and `sharedData: true` in the editing configuration. The base class does not create a network connection or infer this configuration. Outside the managed runtime, authored data works locally and hooks use `mode: "local"`. External ordinary DOM data changes also trigger `dataChanged`. Replacing a scoped block starts a new binding; normal helper writes keep its identity.

The base class uses native registry APIs directly and does not require the legacy adapter. Removing `option` and `action` exports is a breaking source change: replace those decorators with `static options` and `static actions`, and declare Lit reactivity separately in `static properties`. The editor groups declared action methods into undo steps.

Language inheritance preserves an explicit `lang=""` and never writes inherited language to the widget. The optional localization connection is refreshed when effective language changes; failures dispatch `localizationerror` with `{error}`. Call `super` from lifecycle overrides so observers and listeners are released.

## Scoped custom element registries

Widget documents require browsers with native scoped custom element registries.
New widgets can use `new CustomElementRegistry()` and
`attachShadow({mode: "open", customElementRegistry: registry})` directly.
WebWriter does not replace the native `HTMLElement`, `CustomElementRegistry`, or
`customElements` globals.

WebWriter installs a small compatibility adapter before widget modules in editing
frames, previews, saved documents, and package-test frames. This allows older
`LitElementWw` bundles to keep using their legacy registry integration without rebuilding:

| Legacy API | Native operation |
|---|---|
| `attachShadow({customElements: registry})` or `{registry}` | `attachShadow({customElementRegistry: registry})` |
| `shadowRoot.customElements` or `.registry` | Read `shadowRoot.customElementRegistry` |
| `shadowRoot.createElement()` / `.createElementNS()` | Owning document's creation method with the root's registry |
| `shadowRoot.importNode(node, deep)` | Owning document's `importNode(node, {customElementRegistry, selfOnly: !deep})` |

An explicit native `customElementRegistry` option takes precedence over legacy
options. Registry aliases are read-only, following native registry association
rules. Standard HTML parsing, element upgrades, lifecycle callbacks, attributes,
and namespaces remain browser responsibilities. The adapter does not emulate
unsupported browsers or the old polyfill's internal implementation.

Do not load `@webcomponents/scoped-custom-element-registry` alongside the adapter:
that polyfill replaces browser globals. WebWriter replaces its previously
injected, pinned CDN script when exporting an existing document. A widget that
bundles or imports the old full polyfill itself must remove that dependency.
For standalone documents outside WebWriter, load
`src/scoped-custom-element-registry.js` as a classic script before legacy widget
modules, as shown by the repository's examples. Saved exports embed the adapter
and require no separate adapter download.
