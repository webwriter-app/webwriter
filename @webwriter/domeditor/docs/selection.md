# EditingSelection (`$`)

`EditingSelection` (in `src/utility.ts`, usually imported as `$`) is a static facade over the document's current selection. It classifies selections into editing-relevant kinds, exposes their boundaries and covered nodes, and provides the primitive content operations everything else builds on.

```js
import { $ } from "./src/utility"

document.body.innerHTML = "<p>hello world</p>"
$.selectRange(document.querySelector("p").firstChild, 0, document.querySelector("p").firstChild, 5)
$.isTextSelection  // true
$.cut()            // returns a fragment containing "hello", removes it
```

## Selection kinds

A selection is always one of a few editing-relevant shapes:

| Kind | Test | Meaning |
| --- | --- | --- |
| caret | `isEmpty` | collapsed selection |
| gap | `isGapSelection` | caret *between* elements (e.g. between two `<p>`s) |
| element | `isElementSelection` | exactly one element selected |
| text | `isTextSelection` | within a single non-empty text node (carets included) |
| cross-node | `isCrossNodeSelection` | anchor and focus in different nodes |
| empty container | `isEmptySelection` | caret at offset 0 of a content-less container |
| empty document | `isEmptyDocumentSelection` | caret in a body with no editable elements |

```js
document.body.innerHTML = "<p>a</p><p>b</p>"
$.selectGap(document.body.firstElementChild)   // caret between the two <p>s
$.isGapSelection      // true
$.isEmpty             // true
$.isElementSelection  // false
```

## Setting the selection

### `selectRange(anchorNode, anchorOffset?, focusNode?, focusOffset?)`

Sets anchor and focus. Collapses to the anchor when the focus is omitted.

```js
$.selectRange(text, 2, text, 5) // range
$.selectRange(text, 2)          // collapsed caret at offset 2
```

### `selectElement(element)`

Selects the element itself — the selection is anchored in its parent and spans exactly the element.

```js
$.selectElement(p)
$.selectedElement === p // true
```

### `selectGap(element, direction?)`

Places the caret in the gap `"before"` or `"after"` (default) the element — a position in its parent.

### `selectDocumentStart()`

A collapsed selection at the start of `<body>`.

### `selectCoords(x, y, extend?)`

Moves (or extends) the selection to the document position at the given viewport coordinates, snapping to element gaps at text boundaries. Requires layout (`caretPositionFromPoint`).

### `move(node, offset?)` / `extend(node, offset?)`

`move` collapses the selection to a position; negative offsets count from the node's end (`-1` = the very end). `extend` moves only the focus, keeping the anchor.

```js
$.move(text, 3)      // caret at offset 3
$.move(text, -1)     // caret at the end
$.extend(text, 7)    // grow the selection to offset 7
```

### `moveBy(granularity, direction?)` / `extendBy(granularity, direction?)`

Move/extend by `"character"`, `"word"` or `"line"` (uses the non-standard `Selection.modify`; unavailable in some environments).

## Reading the selection

### Boundaries

`anchor`/`anchorOffset` and `focus`/`focusOffset` mirror the native selection. `start`/`startOffset` and `end`/`endOffset` are normalized to document order, with `isBackwards` telling you whether focus precedes anchor:

```js
$.selectRange(text, 5, text, 2) // dragged right-to-left
$.isBackwards   // true
$.startOffset   // 2
$.endOffset     // 5
```

### Containers

- `commonAncestor` — the deepest node containing the whole selection (the text node itself for selections within one text node).
- `anchorContainer` / `focusContainer` — the anchor/focus as an *element* (a text node's parent).
- `siblings` — child nodes of the common ancestor.
- `selectedElement` — the selected element for element selections, else `undefined`.

### `nodesBetween`

The common ancestor's children covered by the selection — the topmost nodes an operation like `setAttributes` should affect. For element selections it is `[selectedElement]`; for a selection inside a single text node it is `[]` (the common ancestor has no children).

```js
document.body.innerHTML = "<p>a</p><p>b</p>"
const [ta, tb] = [...document.querySelectorAll("p")].map(p => p.firstChild)
$.selectRange(ta, 0, tb, 1)
$.nodesBetween // [<p>a</p>, <p>b</p>]
```

### `elementBefore` / `elementAfter`

The element adjacent to the selection: the selected element's sibling, the element beside a gap, or the text container's sibling.

```js
document.body.innerHTML = "<p>a</p><hr><p>b</p>"
$.selectElement(document.querySelector("hr"))
$.elementBefore // <p>a</p>
$.elementAfter  // <p>b</p>
```

## Content operations

| Method | Effect | Returns |
| --- | --- | --- |
| `copy()` / `slice` | nothing (non-destructive) | clone of the selected content |
| `delete()` | removes the selected content | — |
| `cut()` | removes the selected content | the removed fragment |
| `replace(...nodes)` | swaps the selected content for `nodes` (inserts at the caret when collapsed) | — |

```js
document.body.innerHTML = "<p>hello world</p>"
$.selectRange(text, 0, text, 5)
$.replace(document.createElement("b"), document.createElement("u"))
// <p><b></b><u></u> world</p>
```

## Misc

- `range` — the selection's first (and only relevant) `Range`.
- `getNodesInRange(range)` — the children of the range's start container that lie within the range.
- `toString()` — formats the selection as `"anchor@offset-focus@offset"`, e.g. `"#text@2-#text@5"`.

---

# SelectionFeature

`SelectionFeature` (in `src/features/selection.ts`) is the editing feature that **visualizes** the current selection. On every selection change it classifies the selection and applies marker classes that the editor stylesheet renders:

| Selection kind | Marker |
| --- | --- |
| element selection | `◆element-selected` on the element (skipped during drag selections) |
| text selection / caret in text | `◆text-selected` on the containing element |
| caret in an empty element | `◆empty-selected` on the element |
| gap between elements | `◆gap-after-selected`/`◆gap-before-selected` on the adjacent element and the gap caret |

```js
const {selection} = editor.features

document.body.innerHTML = "<p>a</p><p>b</p>"
$.selectGap(document.body.firstElementChild)
selection.processSelection()
document.body.firstElementChild.classList.contains("◆gap-after-selected") // true
SelectionFeature.gapAnchor // <p>a</p> — the element the gap caret is attached to
```

### `processSelection(inDragSelection?)`

Clears all previous markers (dropping emptied `class` attributes) and re-applies them for the current selection. Runs automatically on every `selectionchange`; the parameter suppresses element markers while a drag selection is in progress.

### `gapCaret` / `SelectionFeature.gapAnchor`

`gapCaret` is the caret element shown in gaps between elements, created lazily on the first gap selection and hidden (`visibility` attribute) whenever the selection leaves the gap. `gapAnchor` is the element the gap caret is currently attached to, or `null`.

### Pointer & keyboard behavior

- **pointerdown** starts a drag selection at the pointer position; with the platform modifier it selects the whole clicked element instead. Editor-only elements are ignored.
- **double / triple click** select the word / line under the cursor.
- **pointerup** ends the drag selection.
- While modifier keys are held, the body carries `◆key-mod-down`, `◆key-alt-down` and `◆key-shift-down` classes for styling.

### `enable()`

Enables the listeners and places the selection at the document start.
