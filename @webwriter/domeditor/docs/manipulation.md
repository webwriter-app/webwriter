# ManipulationFeature

`ManipulationFeature` (in `src/features/manipulation.ts`) implements content manipulation: inserting, deleting, wrapping and lifting nodes, clipboard interaction, and setting attributes or styles. All operations work on the current selection (see [`selection.md`](./selection.md)).

```js
const {manipulation} = editor.features

document.body.innerHTML = "<p>hello world</p>"
$.selectElement(document.querySelector("p"))
manipulation.wrap(document.createElement("div"))
// <div><p>hello world</p></div>
```

## Keyboard behavior

The feature's document listeners map keys to the methods below:

| Key | Action |
| --- | --- |
| `Enter` | split the containing block (`insert()`) |
| `Shift+Enter` | insert `<br>` |
| `Shift+Alt+Enter` | insert `<wbr>` |
| `Mod+Enter` | split two levels |
| `Backspace` / `Delete` | delete backward/forward by character |
| `Alt+Backspace/Delete` | …by word |
| `Mod+Backspace/Delete` | …by block |
| `Alt+Mod+Backspace/Delete` | …by line |
| `Tab` | wrap into the previous element (`wrap()`) |
| `Shift+Tab` | lift one level (`lift(1)`) |

(`Mod` is `⌘` on Apple platforms, `Ctrl` elsewhere.)

## Methods

### `insert(node?, splitDepth?, strict?)`

Inserts `node` at the selection, replacing any selected content. **Without a node**, splits the containing block at the caret — the Enter behavior. `splitDepth` is the number of *additional* ancestor levels to split (`0` = one split); `<body>` and `<html>` are never split.

Splitting continues the container as a clone. With `strict`, *inseperable* containers (e.g. headings) continue as a new default node instead:

```js
// Insert at a gap
document.body.innerHTML = "<p>a</p><p>b</p>"
$.selectGap(document.body.firstElementChild)
manipulation.insert(document.createElement("hr"))
// <p>a</p><hr><p>b</p>

// Split a paragraph (Enter)
document.body.innerHTML = "<p>hello world</p>"
$.move(text, 5)
manipulation.insert()
// <p>hello</p><p> world</p>

// Split a heading strictly: continue in a <p>
document.body.innerHTML = "<h1>hello</h1>"
$.move(text, 2)
manipulation.insert(undefined, 0, true)
// <h1>he</h1><p>llo</p>
```

### `delete(direction?, granularity?, strict?)`

Deletes content at the selection:

- A non-collapsed selection is simply removed.
- A selection in an **empty container** removes that container; the caret moves to the previous node.
- A collapsed selection is first **extended** by `granularity` (`"character"`, `"word"`, `"line"`, or `"block"` which extends to the container start) in `direction`.
- A caret in the **gap between two elements** merges them: backward moves the following element's content into the preceding element, forward the reverse.

```js
// Merge two blocks (Backspace at the start of the second paragraph)
document.body.innerHTML = "<p>hello</p><p>world</p>"
$.selectGap(document.body.firstElementChild)
manipulation.delete("backward")
// <p>helloworld</p>

// Delete to the block start
document.body.innerHTML = "<p>hello world</p>"
$.move(text, 5)
manipulation.delete("backward", "block")
// <p> world</p>
```

### `wrap(wrapping?, strict?)`

Wraps the selection. Given a **wrapper element** (or a fragment, whose first element is used), it wraps the selected content, replaces the selection, and is returned:

```js
document.body.innerHTML = "hello world"
$.selectRange(document.body.firstChild, 0, document.body.firstChild, 5)
manipulation.wrap(document.createElement("b"))
// <b>hello</b> world
```

**Without an argument** (the Tab behavior), the element containing the caret is moved into the adjacent element (preferring the previous one), which is returned — or `undefined` if there is none:

```js
document.body.innerHTML = "<div>x</div><p>b</p>"
$.move(document.querySelector("p").firstChild, 0)
manipulation.wrap()
// <div>x<p>b</p></div>
```

### `lift(depth?, strict?)`

Lifts the selected element (or the element containing the caret) out of its container, `depth` levels up, splitting the container around it when it has siblings. Schema-validated via `Schema.getLiftTarget`: does nothing when no valid lift target exists. The lifted element is selected afterwards.

```js
// Simple lift
document.body.innerHTML = "<div><p>hello</p></div>"
$.selectElement(document.querySelector("p"))
manipulation.lift()
// <p>hello</p>

// Lifting splits containers with siblings
document.body.innerHTML = "<div><p>a</p><p>b</p><p>c</p></div>"
$.selectElement(document.querySelectorAll("p")[1])
manipulation.lift()
// <div><p>a</p></div><p>b</p><div><p>c</p></div>

// Multiple levels
document.body.innerHTML = "<section><div><p>x</p></div></section>"
$.selectElement(document.querySelector("p"))
manipulation.lift(2)
// <p>x</p>
```

### `copy()` / `cut()` / `paste()`

Clipboard interaction via the async Clipboard API. `copy` writes the selected content as `text/html` and `text/plain` flavors; `cut` additionally removes it from the document; `paste` inserts the clipboard's `text/html` content at the selection.

```js
document.body.innerHTML = "<p>hello world</p>"
$.selectElement(document.querySelector("p"))
await manipulation.cut()
// body is empty; clipboard holds "<p>hello world</p>" + "hello world"

$.selectDocumentStart()
await manipulation.paste()
// <p>hello world</p>
```

### `setAttributes(attrs)`

Sets the given attributes on every element in the selection (`$.nodesBetween`); a `null` value removes the attribute.

```js
document.body.innerHTML = "<p>a</p><p>b</p>"
$.selectRange(firstText, 0, lastText, 1)
manipulation.setAttributes({title: "note", id: null})
// both <p>s get title="note", any id is removed
```

### `setStyle(styles)`

Assigns inline style properties on every element in the selection, merging with existing styles; an empty string clears a property.

```js
$.selectElement(p)
manipulation.setStyle({width: "50px", color: "red"})
manipulation.setStyle({width: ""})     // remove width again
```

## Actions

Every method is also exposed as an action for generic dispatch:

```js
manipulation.actions.insert({type: "insert", html: "<p>Hello</p>"})
manipulation.actions.wrap({type: "wrap", wrapper: "<section></section>"})
manipulation.actions.setAttributes({type: "setAttributes", attrs: {title: "x"}})
```
