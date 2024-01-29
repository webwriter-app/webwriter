---
title: Nesting and Content
order: 304
---

# Nesting and Content

Often, widgets can contain other editable content. This may include text, specific media types, any block nodes, or even other widgets.

## `<slot>`: Where nested content is rendered
In your widget's shadow DOM template, you can add [`<slot>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/slot) elements. These specify where in the shadow DOM child elements of your widget may be placed. You can read more about slots [here](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots#adding_flexibility_with_slots).

```ts
import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"

@customElement("cool-widget")
export class MyWidget extends LitElementWw {
  render() {
    return html`
      Here's my content:
      <slot></slot>
    `
  }
}
```

## `editingConfig.content`: What can be nested
By default, WebWriter considers widgets as leaf nodes with no content. With the `editingConfig`, you can change this behavior and specify what content is allowed or even required.
```json
{
  // your widget's package.json
  "exports": {
    "./widgets/my-widget": "./widgets/my-widget.ts"
  },
  "editingConfig": {
    "./widgets/my-widget": {
      "content": "flow*"
    }
  }
}
```