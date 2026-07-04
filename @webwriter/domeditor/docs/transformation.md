# TransformationFeature

`TransformationFeature` (in `src/features/transformation.ts`) lets users spatially transform elements: an overlay with drag handles for **moving**, **scaling** and **rotating** the target, plus controls for **float**, **z-order** and the **positioning mode**. The element being transformed is marked with the `◆transform-target` class.

```js
const {transformation} = editor.features

transformation.startTransform(document.querySelector("img"))
transformation.toggleAbsoluteRelative()   // position: absolute
transformation.moveZ(transformation.target, true, true) // bring to front
transformation.clearTransform()
```

## Starting and ending a transform

A transform starts with a **modifier double click** on a selected element (or programmatically via `startTransform`), and ends with a click outside the overlay (or `clearTransform`).

### `startTransform(element)`

Marks the element as the transform target and shows the overlay and position anchor. The document root, `<head>` and `<body>` are refused.

### `clearTransform()`

Removes all transform marker classes from the document (`◆transform-target`, `◆transform-containing-block`, `◆transform-scrolling-ancestor`, `◆transform-stacking-container`), hides the overlay and anchor, and closes any open menus.

### `updateInfo()`

Synchronizes the overlay with the target: sizes/rotates the overlay to match, marks the target's **containing block**, **scrolling ancestor** and **stacking container** in the document, and updates the control states (float, position, z-order, changed/narrow markers).

```js
transformation.startTransform(el)
document.body.classList.contains("◆transform-containing-block")            // true (static el)
document.documentElement.classList.contains("◆transform-stacking-container") // true
```

## The overlay

Created lazily on first access and kept in the editor appendix. It contains:

- eight **scale handles** (corners and edges),
- a **rotator** handle,
- the **arranger** (float control with a none/left/right menu),
- the **orderer** (z-order control with forward/backward menu).

```js
transformation.overlay // the overlay element (created on demand, reused)
transformation.target  // the current ◆transform-target element
```

When the target is narrower than 120px the overlay switches to a narrow layout (`isNarrow`), where the arranger and orderer act directly instead of opening menus.

## Drag interactions

All three interactions are pointer drags on the overlay, with consistent modifiers:

| Interaction | Drag | `Mod` | `Shift` | `Alt` |
| --- | --- | --- | --- | --- |
| **Move** (overlay) | set `left`/`top` | place statically | constrain to one axis | no snapping |
| **Scale** (handles) | set `width`/`height` | scale symmetrically around the center | stretch via `scale()` | no snapping |
| **Rotate** (handle) | set `rotate` | — | 45° steps | no snapping |

Snapping defaults: moving and scaling snap to 10px, rotating to 5° (see `getRoundingFunc`). While moving without `Alt`, hovering near a static element's edges shows a **drop caret** — releasing there re-inserts the target statically before/after that element, clearing its transform styles.

## Positioning controls

### `toggleAbsoluteRelative()` / `toggleSticky()`

Cycle the target's positioning mode (clearing its offsets when toggling absolute/relative). The **anchor** element visualizes the static position of relative/sticky targets; clicking it toggles absolute/relative.

### `restore()`

Resets all transform-related styles of the target — `width`, `height`, `rotate`, `scale`, `float`, `position`, `top`, `left`.

## Arranging

### Float (arranger)

The arranger menu sets the target's `float` to `none`, `left` or `right`; the current value is mirrored in its `data-float` attribute.

### `moveZ(el, forward?, toFrontOrBack?, cycle?)`

Changes the element's paint order within its stacking container: one step (or with `toFrontOrBack` all the way) forward or backward, with `cycle` wrapping around. All non-editor elements in the container get sequential `z-index` values:

```js
// body: <div>a</div><div>b</div><div>c</div>
transformation.moveZ(c, false)      // move c one step back → z-indexes: a=1, c=2, b=3
transformation.moveZ(a, true, true) // bring a to the front  → b=1, c=2, a=3
```

## Clipboard & deletion

While a target is active:

- **Delete/Backspace** removes the target from the document.
- **Copy/Cut** put the target's cleaned HTML on the clipboard (editor-only elements removed, marker classes stripped) as `text/html` and `text/plain`; cut also removes the target.
