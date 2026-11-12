# Nest content

A widget can show text, HTML elements, and other widgets in its interface. Its editing configuration specifies which children authors can add and edit. The widget can respond to changes in its child elements.

![A nested widget and editable text inside an outer widget](../../images/widgets/content.svg)

Keep authored content in the widget's light DOM. Use a [slot](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot) to show that content. This callout widget lets authors edit a note in the document.

```html
<ww-callout><p>Bring a reusable water bottle.</p></ww-callout>
```

```html
<!-- In the widget's shadow DOM -->
<slot></slot>
```

Declare the child elements that authors can insert and edit.

```json
{
  "editingConfig": {
    "./widgets/ww-callout": {"content": "p+", "marks": "b i"}
  }
}
```

The authoring tool treats the widget as a single element if the configuration has no `content` entry. For nested widgets, specify their tag names or groups in the [content expression](../reference/content-expressions.md). Set `uninsertable: true` if authors can insert the child widget only through a parent or snippet.

Use [`slotchange`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLSlotElement/slotchange_event) to detect changes to slot assignments. Use a [`MutationObserver`](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) to detect changes to the content of those children. Disconnect the observers when the widget disconnects. Examine the current children before you change them. Keep unfamiliar children, comments, and grouping metadata.

## Allowed child elements

## Changes to child content
