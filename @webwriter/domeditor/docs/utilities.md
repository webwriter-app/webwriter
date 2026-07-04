# Utilities

Standalone helpers from `src/utility.ts`, grouped by concern. (For the `EditingSelection`/`$` class in the same file, see [`selection.md`](./selection.md).)

## DOM helpers

### `getContainer(node)`

The node itself for elements, the parent element for text nodes — "the element this position lives in".

```js
getContainer(textNode) // textNode.parentElement
getContainer(element)  // element
```

### `getSidesOfPoint(point: Range)`

Splits the children of the point's container into those before and those at/after the point, as `[left, right]`.

```js
document.body.innerHTML = "<p>a</p><p>b</p><p>c</p>"
const point = document.createRange(); point.setStart(document.body, 1)
const [left, right] = getSidesOfPoint(point)
// left: [<p>a</p>], right: [<p>b</p>, <p>c</p>]
```

### `getSelectionAnchorBlock(schema)` / `getSelectionFocusBlock(schema)`

The nearest *block* ancestor (see `Schema.isBlock`) of the selection anchor/focus — the paragraph-like container you are typing in.

```js
document.body.innerHTML = "<p><b>hello</b></p>"
$.move(document.querySelector("b").firstChild, 2)
getSelectionAnchorBlock(schema) // the <p> (skips the inline <b>)
```

### `getIndexBefore(range)`

Index of the child preceding the range within the selection's container (`-1` when the range starts at the container start).

### `getPathTo(element)`

XPath-like path to the element, anchored at the nearest `id` or at `BODY`. Empty string for `null` or detached elements.

```js
getPathTo(secondParagraphInDiv) // 'BODY/DIV[1]/P[2]'
getPathTo(pInsideDivWithId)     // 'id("x")/P[1]'
```

### `htmlToFragment(html)`

Parses an HTML string into a `DocumentFragment`.

### `findClosest(el, filter)`

The closest ancestor-or-self of `el` matching the filter, or `undefined`.

```js
findClosest(el, n => n.tagName === "ARTICLE")
```

## Type guards

`isElement(x)`, `isText(x)`, `isComment(x)`, `isDocument(x)` — TypeScript type guards accepting any value:

```js
isElement(document.body) // true
isText("hello")          // false (not a node at all)
```

## Platform

### `isOnApple()`

Whether the platform is macOS or iOS.

### `modifierKeyDown(event)`

Whether the platform's primary modifier is pressed: `metaKey` (`⌘`) on Apple platforms, `ctrlKey` elsewhere.

```js
document.addEventListener("keydown", ev => {
  if(ev.key === "s" && modifierKeyDown(ev)) save()
})
```

## Geometry

| Function | Description |
| --- | --- |
| `roundByDPR(value)` | round to the device pixel ratio (`1.3` → `1.5` at DPR 2) |
| `roundTo(value, to)` | round to the nearest multiple of `to` (`roundTo(7, 5)` → `5`) |
| `angleOnCircle(cx, cy, x1, y1, x2, y2)` | signed angle in degrees between two points, seen from the center |
| `rotatePoint(x, y, cx, cy, angle)` | rotate a point around a center by degrees, → `[x', y']` |
| `distanceBetweenPoints(x1, y1, x2, y2)` | euclidean distance |
| `midpoint(x1, y1, x2, y2)` | the point halfway between, → `[x, y]` |
| `intersectionPoint(x1, y1, …, x4, y4)` | intersection of two segments, → `[x, y]` or `false` |

```js
rotatePoint(1, 0, 0, 0, 90)              // [0, 1]
intersectionPoint(0,0, 2,2, 0,2, 2,0)    // [1, 1]
intersectionPoint(0,0, 1,0, 0,1, 1,1)    // false (parallel)
```

These power the transformation feature (rotate/scale handles).

## CSS layout & stacking

Used by the transformation overlays to position handles and order elements.

### `findContainingBlock(el, position?)`

The element's [containing block](https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block) for a position mode, per CSS rules — the nearest formatting context for `static`/`relative`/`sticky`, the nearest positioned (or transformed) ancestor for `absolute`, the nearest transformed ancestor for `fixed` — falling back to `window`.

```js
findContainingBlock(el, "absolute") // nearest position: relative/… ancestor, or window
```

### `findScrollingAncestor(el)`

The closest ancestor-or-self with scrollable overflow (`hidden`, `scroll`, `auto`, `overlay`), or `undefined`.

### `createsStackingContext(el)`

Whether the element creates a [stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context) (root element, positioned with z-index, transforms/filters, `opacity < 1`, `isolation: isolate`, top layer, …).

### `findStackingContainer(el)`

The nearest ancestor creating a stacking context (at least `<html>`).

### `compareStackingOrder(a, b)` / `getDescendantsInStackingOrder(node, selector?)` / `getZPos(el, selector?)`

Paint-order utilities: `compareStackingOrder` compares two elements (negative when `a` paints below `b`), by the z-index of their stacking contexts with DOM order as the tiebreaker. `getDescendantsInStackingOrder` returns matching descendants sorted lowest-first, and `getZPos` gives an element's index in that order within its stacking container.

```js
document.body.innerHTML = `
  <div id="top" style="position: relative; z-index: 2"></div>
  <div id="bottom" style="position: relative; z-index: 1"></div>`
getDescendantsInStackingOrder(document.body, "div").map(el => el.id)
// ["bottom", "top"]
```

### `getStaticCoords(el)`

The `[top, left]` viewport coordinates the element would have at its *static* position, measured by temporarily inserting a marker (the document is left unchanged). Requires layout.
