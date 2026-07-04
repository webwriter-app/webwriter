# @webwriter/domeditor

The DOM editor of WebWriter: a rich document editor that uses the **live DOM as its data model**. Instead of maintaining a separate document state, the editor turns on `document.designMode`, observes mutations, validates content against an HTML-like **schema**, and exposes editing operations that work on the current **selection**.

## Modules

| Module | Contents |
| --- | --- |
| [`schema.md`](./schema.md) | `Schema` — content model: which nodes are allowed where, validity queries and automatic corrections |
| [`selection.md`](./selection.md) | `EditingSelection` (alias `$`) — a static facade over the document selection — and `SelectionFeature`, which visualizes it |
| [`manipulation.md`](./manipulation.md) | `ManipulationFeature` — insert, delete, wrap, lift, clipboard, attributes and styles |
| [`transformation.md`](./transformation.md) | `TransformationFeature` — move, scale, rotate, float and z-order elements via an overlay |
| [`utilities.md`](./utilities.md) | Standalone helpers — DOM traversal, type guards, geometry, CSS layout/stacking |

## Quick start

```bash
bun run dev    # start a dev server with a demo document
bun run test   # run the vitest suite
```

```js
import { DOMEditor } from "./src/domeditor"
import { $ } from "./src/utility"

const editor = new DOMEditor()           // turns on designMode, enables all features
window.editor = editor

// Work with the selection…
$.selectElement(document.querySelector("p"))

// …and manipulate content through the features:
editor.features.manipulation.wrap(document.createElement("section"))

// Serialize the document without editing artifacts:
const html = editor.toHTML()
```

## Architecture

```
DOMEditor
├── schema: Schema            content model & validation
├── doc: SharedDOMDoc         (collaborative) document state, yjs-backed
└── features                  editing behaviors, each with actions + listeners
    ├── manipulation          insert/delete/wrap/lift/clipboard/attrs/styles
    ├── selection             selection handling
    ├── history               undo/redo
    ├── mark                  text-level marks (bold, italic, …)
    ├── placeholder           placeholders for empty elements
    ├── transformation        scale/rotate/translate overlays
    └── dependency            scripts, styles, templates
```

Every feature exposes an `actions` map. Actions can be dispatched generically:

```js
editor.getActionHandler("insert")({type: "insert", html: "<p>Hello</p>"})
editor.getActionHandler("setStyle")({type: "setStyle", styles: {color: "red"}})
```

## Testing

Tests run with [vitest](https://vitest.dev) in a [happy-dom](https://github.com/capricorn86/happy-dom) environment. Selection APIs, the clipboard and computed styles are available; layout-dependent behavior (`selectCoords`, `Selection.modify` granularities) is not testable there and is exercised in the browser instead.
