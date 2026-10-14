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

WebWriter gives installed widgets a persistent `id` if missing. It adds temporary marker classes and `contenteditable=""` while editing if no authored `contenteditable` exists. These editor artifacts are not saved or shared. Preserve authored IDs and unfamiliar content.

Shadow-DOM events are ignored by editor features unless `propagateEvents` opts in. Deliberate widget changes to authored DOM are still observed and synchronized.

## `LitElementWw`

Import from `@webwriter/lit`. Call `super` when overriding its lifecycle callbacks.

| Member | Purpose |
|---|---|
| `editable` | Getter for `isContentEditable`; updates when runtime `contenteditable` changes. |
| `lang` | Reactive language, following the nearest ancestor unless explicitly set. |
| `static scopedElements` | Map of tag names to component classes used inside shadow DOM. |
| `localize` | Optional `{getLocale, setLocale}` connection from `@lit/localize`. |
| `static dataType` | Default inert data-block MIME type; initially undefined. |
| `dataType` | Current data-block type, falling back to the class default. |
| `data` | Text of the first direct inert script child without `src`, or `null`. Setting it uses `dataType` or `text/plain`. |
| `setData(type, value, attrs?)` | Creates or replaces that data block, preserving existing attributes and applying supplied attributes. Rejects executable script types. |
| `@option(declaration)` | Adds a property accessor to the options map. |
| `@action(declaration)` | Adds a method to the actions map. |

The data helpers also support ordinary authored data blocks. Scoped participant data has the narrower [data-block contract](data.md): JSON or XML, `slot="data"`, and `sharedData: true`. Replacing a scoped block starts a new binding; write its current `textContent` for ordinary updates.
