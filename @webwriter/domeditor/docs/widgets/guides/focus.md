# Handle selection & input

A widget can move keyboard focus to its controls. It can specify which input events the authoring tool must receive. It can also move the caret to the authored content.

![Tab advances focus between widget controls](../../images/widgets/focus.svg)

Select **Focus first sound**, then press Enter to activate the focused button. Use Tab and Shift+Tab to move between the controls.

<!-- live-example: Keyboard focus -->

```js vanilla
class Soundboard extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <button data-sound type="button">Rain</button>
      <button data-sound type="button">Wind</button>
      <button id="focus" type="button">Focus first sound</button>
      <output aria-live="polite"></output>`
    this.shadowRoot.querySelector("#focus").addEventListener("click", () => this.focus())
    this.shadowRoot.addEventListener("click", event => {
      if(event.target.id === "focus") return
      if(!event.target.matches("[data-sound]")) return
      this.shadowRoot.querySelector("output").textContent = `Selected ${event.target.textContent}`
    })
  }

  focus(options) {
    this.shadowRoot.querySelector("[data-sound]")?.focus(options)
  }
}

customElements.define("ww-soundboard", Soundboard)
```

```html
<ww-soundboard></ww-soundboard>
```

<!-- /live-example -->

Use native buttons, inputs, and labels in the shadow DOM to get standard keyboard behavior.

Implement [`focus()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus) to move focus from the widget to a control. In this example, a soundboard moves focus to its first sound button.

```js
focus(options) {
  this.shadowRoot.querySelector("button[data-sound]")?.focus(options)
}
```

Use [`:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible) to show which control has focus. Use [`<output aria-live="polite">`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live) for feedback that an assistive technology must announce.

The authoring tool ignores input events from the widget's shadow DOM by default. List the required event types in `propagateEvents`, for example `["keydown"]`. Test the keyboard shortcuts in widget inputs. Make sure that typing causes only the intended actions.

## Move the document selection

When the widget host has direct focus, the authoring tool lets the widget handle input. When that host loses focus, the authoring tool selects the widget element. The widget can then use the native [Selection API](https://developer.mozilla.org/en-US/docs/Web/API/Selection) to change the document selection. This example moves the caret to an authored text node.

```js
this.blur()
const selection = this.ownerDocument.getSelection()
selection?.setPosition(textNode, 0)
```

Get `textNode` from the current document. Edits can replace or remove a node. Move focus away from the host before you set the selection. For this operation, the host must accept focus directly.

The authoring tool can follow selections in authored children while the widget has focus. To move the document selection outside the widget, first move focus away from the host.

Test Tab, Shift+Tab, Enter, and Space in edit mode and in preview. Update the existing controls to keep their focus.

## Keyboard focus order

Tab visits focusable elements in the order of the document tree, and the shadow DOM of a widget is part of that tree at the place of its host. Write the template in reading order: the controls come before or after the content in the order a person expects them. Do not reorder with CSS (`order`, `grid-area`, `position`) in a way that makes the focus jump around the screen, and never use a positive [`tabindex`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex).

- Native controls are in the order already. Add `tabindex="0"` only to an element that has its own keys, such as a canvas stage or a list. Use `tabindex="-1"` for an element that script focuses.
- Authored children that a `<slot>` shows come in the focus order at the position of the slot, not at the position of the host.
- Make a group of related controls, such as a toolbar, a list of choices, or a grid, one Tab stop. The arrow keys move inside it (a roving `tabindex`), and Tab leaves it. Give the focused item `tabindex="0"` and the others `tabindex="-1"`.
- Never trap the focus. Tab and Shift+Tab must always leave the widget, also from a stage that takes the arrow keys.
- Take hidden controls out of the order with the [`hidden`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden) attribute or [`inert`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert). An element with `display: none` is not focusable, but one that is only transparent or moved off screen still is.
- When the widget renders again, keep the focus on the same control. Replace the content of a list by updating its items, not by creating them again, or focus the equivalent item afterwards.

```js
// Roving tabindex: one Tab stop for the whole group.
#select(items, index) {
  items.forEach((item, position) => (item.tabIndex = position === index ? 0 : -1))
  items[index].focus()
}

#keydown(event) {
  const items = [...this.shadowRoot.querySelectorAll("[role=option]")]
  const current = items.indexOf(event.target)
  if(current < 0) return
  const next = {ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: items.length - 1}[event.key]
  if(next === undefined || !items[next]) return
  event.preventDefault()
  this.#select(items, next)
}
```

Check the order in edit mode and in preview.

## Pointer and touch input

Use [pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) for one code path that serves a mouse, a pen, and a finger. Call [`setPointerCapture()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) on `pointerdown` so that the moves arrive when the pointer leaves the element, and end the gesture on `pointercancel`, which a browser sends when it takes the touch for scrolling.

Every action that needs a drag or a gesture also needs a way without one: a click, a key, or a button. Do not make anything depend on hover. A tooltip is no place for the only explanation of a control.

### Target sizes

| Target | Size |
|---|---|
| Every control that a pointer presses: buttons, handles, ports, list items | At least 24 × 24 CSS px, or 24 px of free space around it ([WCAG 2.2, Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum)). |
| Primary controls and drag handles | 44 × 44 CSS px where the layout has room ([WCAG 2.2, Target Size (Enhanced)](https://www.w3.org/TR/WCAG22/#target-size-enhanced)). |
| Touch screens | Use 44 px for the controls above. Test with `@media (pointer: coarse)`. |

A small mark can have a large target. Pad the control, or extend its hit area with a pseudo-element, and keep the look.

```css
.handle { position: relative; inline-size: 1rem; block-size: 1rem; }
.handle::before { content: ""; position: absolute; inset: -1rem; }

@media (pointer: coarse) {
  button, [role="button"] { min-inline-size: 44px; min-block-size: 44px; }
}
```

### Scrolling and `touch-action`

A finger that moves over an element scrolls the page unless the element says otherwise with [`touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action). Set `touch-action: none` only on the element that starts a drag, such as a handle or a canvas stage, and not on the whole widget: a strip of draggable thumbnails must still scroll by touch. Use `pan-y` or `pan-x` for an element that scrolls along one axis and handles the other.

With the [Drag](../reference/lit.md#drag) module, put `data-ww-drag-handle` on the part of an item that starts the drag. The module sets `touch-action: none` on the handle only, so a touch anywhere else on the item scrolls. An item without a handle is a drag from anywhere, and the whole item gets `touch-action: none`.

```html
<ul class="strip" data-ww-drop="photo" data-ww-drop-position="index">
  <li data-ww-drag="photo" data-ww-key="a">
    <img src="a.jpg" alt="Seedlings in a tray">
    <button type="button" class="grip" data-ww-drag-handle aria-label="Move photo">⠿</button>
  </li>
</ul>
```

```css
.strip { display: flex; gap: .5rem; overflow-x: auto; }
.grip { min-inline-size: 44px; min-block-size: 44px; }
```

### Zoomed content

[Scene](../reference/lit.md#scene) scales its nodes with the zoom of the view, so a button in a node is half the size at half the zoom. Mark a control that must stay usable with `data-ww-control`. Scene draws it larger by the inverse of the zoom while the view is zoomed out, so that it keeps the size it has at 100 %, down to a zoom of 1/6 (`--ww-control-limit`). This holds for a scene that zooms itself; a scene inside a scrolling `data-ww-viewport` that is zoomed from outside keeps the plain scaling. Resize handles of Scene stay 8 px. Design the control for the sizes in the table above.

Test with a mouse, with a finger (a phone or the device emulation of the browser), and with a pen if the widget draws. Check that a drag does not start a page scroll, that a scroll does not start a drag, and that a canceled touch leaves nothing half done.
