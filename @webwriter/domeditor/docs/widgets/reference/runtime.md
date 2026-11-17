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
| `static options` / `options` | [Option declarations](options-actions.md) for the Widget drawer. `hidden`, `disabled`, and `readOnly` can be [functions of the widget](options-actions.md#function-values). |
| `static actions` / `actions` | [Action declarations](options-actions.md). Each action has a method with the same name. `hidden`, `disabled`, and `disabledReason` can be functions of the widget. |
| `static effects` / `effects`, `static signals`, `signals` | [Reactive links](#signals) between authored widgets. |
| `static convertFrom` / `convertFrom`, `static convertTo` / `convertTo` | [DOM conversions and file import or export](../guides/conversions.md). |
| `static aggregate` | [Aggregated View](aggregated-view.md) declaration for aggregate views. |
| `static offlineImports(element)` | [Select optional dynamic imports](#offline-imports) for Offline HTML. |
| `static offlineAssets(element)` | [Declare runtime files](#offline-assets) for Offline HTML. |

The authoring tool gives an installed widget a persistent `id` if the widget has none. During editing, the authoring tool adds `contenteditable=""` to widgets that have no `contenteditable` attribute. The authoring tool saves and shares authored values such as `contenteditable="false"`. The authoring tool omits its temporary value from saved and shared HTML.

While the document is printed, the authoring tool adds the class `ww-beforeprint` to every installed widget element. It adds the class on `beforeprint`, in a print preview, and while the `print` media query matches, and removes it on `afterprint`. The class is runtime state like the temporary `contenteditable`: it is not saved, shared, or recorded in undo history. See [Support printing](../guides/printing.md#the-class-ww-beforeprint).

The authoring tool handles shadow DOM events of the types in `propagateEvents`. The authoring tool also synchronizes changes that the widget makes to the authored DOM.

## Undo transactions

Dispatch bubbling, composed `ww-transactionstart` and `ww-transactionend` events from the widget host around one edit. Send the end event after the widget has finished writing its attributes, light DOM, and scoped data. Send one pair per widget and use `finally` to close the transaction if the edit fails. Overlapping widget transactions share an undo step. Empty transactions leave history untouched, and the editor closes an outstanding transaction after ten seconds or when its host leaves the document.

## Formatting widget-owned text

Set `static marks = "b i color"` to declare the ribbon controls available for the widget's own selection. Use HTML mark names and the style names `font-family`, `font-size`, `color`, and `background-color`. The default is an empty list. `editingConfig.marks` still governs authored light DOM children.

Listen for the bubbling, cancelable `ww-mark` event on the widget host. Its detail contains `name` and `value`. Toggle an element mark when the value is undefined, set styles and plain link addresses with a string value, and clear them when the value is `null`. Call `preventDefault()` when the widget applies the command. A parent widget can handle a request that bubbles from its child.

When the widget selection or formatting changes, dispatch a bubbling, composed `ww-markstate` event from the host with details such as `{b: true, color: "#c00", a: "https://example.com/"}`. The editor supports plain links and built-in fonts for widget-owned text. A focused shadow field marked `data-ww-text` can narrow its host's declared marks using `data-ww-marks`.

## Signals

Widgets can publish signals. Other widgets can read these signals and respond to changes.

### Source protocol

The source widget's `signals` object maps public names to read-only signals. A signal is any object with a `get()` method and no `set()` method. Keep these signal instances stable. A signal from [Signals](https://lit.dev/docs/data/signals/) lets receivers follow changes. `@webwriter/widget/signals` exports `signal`, `computed` and `watchSignal` for widgets that do not use Lit. `@webwriter/lit` re-exports `signal` and `computed`.

A signal reflects the widget's current state. A value that the document does not store, such as a history since the page loaded, says so in its declaration's `description`.

### Signal declarations

The static `signals` map of the widget class declares the published signals by name. Every entry is optional.

| Field | Type | Purpose |
|---|---|---|
| `shape` | string | The shape of the value. It is one of the [standard shapes](#value-shapes) or a name of your own. |
| `label` | Localized text | The name that the Widget drawer shows in the list of sources. |
| `description` | Localized text | What the value is. Say here whether it survives a reload. |

A signal without a declaration stays available to every effect that does not list `accepts`.

### Effect declarations

Declare one entry in `static effects` for each supported lowercase effect attribute. Each entry needs a `connect(signal, lifetime)` callback. It can also have a localized `label` and `description`, and `accepts`, a list of shapes. The authoring tool calls `connect` with the receiving widget as `this`. The `lifetime` argument is an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). Clear the source when the signal aborts.

When `accepts` is present and not empty, the Widget drawer lists only sources whose declared `shape` is in the list. A link to another signal stays in the HTML and the authoring tool does not connect it. An effect without `accepts` accepts every signal.

### Value shapes

| Shape | Value |
|---|---|
| `number` | A finite number. |
| `string` | A string. |
| `boolean` | `true` or `false`. |
| `series` | An array of finite numbers. |
| `table` | `{columns: string[], rows: (string \| number \| null)[][]}`. Rows can be shorter or longer than `columns`. |

`@webwriter/widget` exports the types `SignalShape`, `SignalShapes`, `SignalValue`, `SignalDeclaration`, `EffectDeclaration`, `ReadableSignal`, `Table` and `Series`, and the functions `isNumber`, `isString`, `isBoolean`, `isSeries`, `isTable`, `hasShape(shape, value)` and `effectAccepts(effect, shape)`. `@webwriter/lit` and the other helper libraries re-export them. The guards check a value at run time. Use one before a widget uses a value that came through an effect without `accepts`.

### Links

An effect attribute uses CSS selector syntax, such as `#sensor[celsius]`. The ID identifies one source widget in the document. The name in brackets identifies a public signal in `source.signals`.

The authoring tool keeps unresolved or circular links in the HTML. The authoring tool connects these links when the connections become valid.

The [Make data reactive guide](../guides/reactivity.md) includes a working example, rules for names, missing sources and circular connections, and how to test an effect. [Lit signals](lit.md#signals) describes the Lit interface and the shared dependency requirements.

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

## Offline assets

The optional `offlineAssets` method synchronously returns an array of `{url, mimeType?}` declarations. As with `offlineImports`, the tool passes a detached copy of each saved widget, including widgets in templates readers can insert. Read the copy to decide which files the reader can use. Use absolute, versioned HTTP(S) URLs without credentials or fragments.

```js
import {assetURL} from "@webwriter/widget"

const sqliteWasm = "https://cdn.jsdelivr.net/npm/sql.js@1.16.0/dist/sql-wasm-browser.wasm"

class CodeSql extends HTMLElement {
  static offlineAssets(element) {
    return element.hasAttribute("disable-execution") ? []
      : [{url: sqliteWasm, mimeType: "application/wasm"}]
  }

  // Call when the reader clicks Run.
  async loadSQLiteBytes() {
    const response = await fetch(assetURL(sqliteWasm, this.ownerDocument))
    if (!response.ok) throw new Error("Could not load SQLite")
    return response.arrayBuffer()
  }
}
```

The exporter fetches each declared URL once and embeds it in the HTML. When supplied, `mimeType` sets the embedded media type. An asset that cannot be fetched fails the export. `assetURL(url, document?)` returns the original URL in the editor and regular HTML. In Offline HTML it returns an embedded data URL, or throws if the asset was not declared. Resolve the URL in the widget document before passing it to a worker.

## Conversions

Each key identifies a format and specifies what the handler receives or returns. The import and export maps are independent. A conversion can keep only the content that the target format can represent.

The form of a key decides what it means. A key that is a lowercase HTML tag name, such as `ul`, is always an HTML element conversion. A key that starts with a dot, such as `.json`, or that is a media type with a slash, such as `image/png`, is always a file conversion. No key means both. `importFormats` and `exportFormats` in the [editing configuration](editing-configuration.md#advertise-file-formats) list file keys only.

| Key | `convertFrom` | `convertTo` |
|---|---|---|
| Lowercase native HTML tag, such as `ul` | Receives a detached `DocumentFragment` with a copy of the source element. Sets the content of the new widget synchronously. Returns nothing or `true` for success. Returns `false` to decline. | Returns a detached element or a detached fragment with one or more sibling elements. Each element uses the declared tag. The fragment can contain comments and formatting whitespace. Returns `null` to decline. |
| Extension such as `.h5p` or concrete media type such as `image/png` | Receives one `File`. Returns a synchronous function that applies the prepared content to the existing widget. Returns `null` or `false` to decline. Can prepare its result asynchronously. | Returns a `File` with a matching extension or media type. Returns `null` or `false` to decline. Can return a promise. |

A tag must name a native element that the document accepts as body content. The authoring tool ignores uppercase names, custom element names, and wildcards such as `image/*`. Use method names or function references. The authoring tool calls the handlers with the widget as `this`. An instance map has priority over a static map. Use `static convertFrom` to declare the DOM tags that a new widget accepts.

The authoring tool checks that the replacement is valid at the source location. For a file import, the authoring tool checks the format and confirms that the original widget can still receive the result. Apply authored changes only in the function that the file handler returns. The authoring tool records these changes as one undo step.

An export handler reads the widget state and returns the result for download. A file handler has ten seconds to return its result. The [conversion guide](../guides/conversions.md) gives examples.

A handler reports a bad input by throwing an `Error` or by returning a rejected promise. The authoring tool shows the message to the author and leaves the document unchanged. The widget words and localizes the message. A failure without a message, such as `new Error()`, shows a generic text. Returning `null` or `false` declines quietly and shows the same generic text for an import. The standalone widget drawer shows messages in the same way. [Validate imported files](../guides/conversions.md#validation-of-imported-files) gives size limits.

### Types

`@webwriter/widget` exports types for both maps, and `@webwriter/lit` and the other libraries re-export them. `ConvertFromDeclarations<Widget>` and `ConvertToDeclarations<Widget>` type a map. Each type allows a file handler for a key that starts with a dot or holds a slash, and rejects a handler of the wrong kind for it. The handler types are `ElementImportHandler`, `FileImportHandler`, `ElementExportHandler`, and `FileExportHandler`. `FileImportResult` is what an import prepares. The key types are `FileExtensionKey`, `MediaTypeKey`, and `FileFormatKey`. `LitElementWw` declares `static convertFrom`, `static convertTo`, and the instance members `convertFrom` and `convertTo` with these types.

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
