---
title: Displaying
order: 101
---

# Displaying
Widgets need to shown to both users and authors. This section explains how to implement a display for your widget and how to use WebWriter's sidebar feature to improve your layout.

## Define a `render` method
To display a widget, a render function returning a template needs to be defined.

In this example, we simply render a [vanilla `textarea` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea) into the widget:

```ts
import {LitElementWw} from "@webwriter/lit"
import {html, css} from "lit"
import {property, query} from "lit/decorators.js"

export default class CoolWidget extends LitElementWw {
  render() {
    return html`<textarea></textarea>`
  }
}
```

## Use a part-based layout
As an extra feature, WebWriter can display your widget's editing elements separately from the widget's content.

For this, the widget's editing element needs the attribute `part="action"`. It should be a single element and a direct child of the widget.

To accomplish this for our example above, we simply add the `part="action"`to the our input element:

```ts
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  value: string

  @property({attribute: true})
  placeholder: string

  static get styles() {
    return css`
      :host(:not([editable])) .placeholder {
        display: none;
      }
    `
  }

  render() {
    return html`
    <input part="action" class="placeholder" @change=${e => this.placeholder = e.target.value}></input>
    <textarea @change=${e => this.value = e.target.value} placeholder=${this.placeholder}>
      ${this.value}
    </textarea>`
  }
}
```

#### Notes
- The part-based layout is preferable for more complex widgets since it makes better use of screen space in WebWriter.
- To have multiple elements for the `action` part, simply add a wrapper element (`<div part="action">...</div>`). Only the wrapper needs the `part="action"`, other elements may