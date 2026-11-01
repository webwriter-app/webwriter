# Handle focus, selection and input

Use native buttons, inputs, and labels in the shadow DOM. They already support keyboard interaction.

![Tab advances focus between widget controls](../../images/widgets/focus.svg)

If focusing the widget should focus a control, implement `focus()`:

```js
focus(options) {
  this.shadowRoot.querySelector("button")?.focus(options)
}
```

Keep focus visible with `:focus-visible`. Use an `<output aria-live="polite">` for feedback that should be announced after an interaction.

Events inside the widget's shadow DOM are ignored by editor features by default. If the editor should handle a particular event type, opt in with `propagateEvents`, for example `["keydown"]`. Check shortcuts while using inputs so typing does not trigger unwanted editor commands.

## Move the document selection

Focusing the widget host captures it for interaction. When the directly focused host is blurred, the editor releases capture and selects the widget as an element. A widget can then use the native Selection API to move the document selection elsewhere; the editor follows that selection. For example, a widget whose host is directly focused can move the caret to an authored text node:

```js
this.blur()
const selection = this.ownerDocument.getSelection()
selection?.setPosition(textNode, 0)
```

Resolve `textNode` from the current document before using it, since document edits can replace or remove nodes. The blur must happen before setting the selection. This direct-host contract requires a focusable host; an overridden `focus()` that delegates to a shadow control does not focus the host directly.

While a widget owns focus, the editor ignores incidental selection changes from its shadow controls. It can still follow selections in the authored children of a contentful widget. A shadow control's selection can appear as a position beside the widget, so moving a document selection outside the widget while it remains focused is not a reliable way to release capture.

Test Tab, Shift+Tab, Enter, and Space in editing and preview. Update existing controls rather than rebuilding the shadow DOM after every interaction, so focus is retained.
