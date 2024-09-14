---
title: Displaying
order: 301
---

# Displaying
Widgets need to shown to both users and authors. This section explains how to implement a display for your widget and how to use WebWriter's sidebar feature to improve your layout.

## Define a `render` method
To display a widget, a render function returning a template needs to be defined.

In this example, we simply render a [`<textarea>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea) into the widget:

```ts
import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"

@customElement("cool-widget")
export default class CoolWidget extends LitElementWw {
  render() {
    return html`<textarea></textarea>`
  }
}
```

## Use a part-based layout
As an extra feature, WebWriter can display your widget's configuration options separately from the widget's content.

For this, the widget's editing element needs the attribute `part="options"`. It should be a single element and a direct child of the widget.

To accomplish this for our example above, we simply add the `part="options"`to the our input element:

```ts
import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"

@customElement("cool-widget")
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  accessor value: string

  @property({attribute: true})
  accessor placeholder: string

  static get styles() {
    return css`
      :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
        display: none;
      }
    `
  }

  render() {
    return html`
    <input part="options" class="author-only" @change=${e => this.placeholder = e.target.value}></input>
    <textarea @change=${e => this.value = e.target.value} placeholder=${this.placeholder}>
      ${this.value}
    </textarea>`
  }
}
```

### Notes
- The part-based layout is preferable for more complex widgets since it makes better use of screen space in WebWriter.
- To have multiple elements for the `options` part, simply add a wrapper element (`<div part="options">...</div>`). Only the wrapper needs the `part="options"`.


### Support Fullscreen
More complex widgets can benefit from using more screen space. This can be accomplished with the [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API).

```ts
import {html, css} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"

@customElement("cool-widget")
export class CoolWidget extends LitElementWw {
  
  constructor() {
    super()
    this.addEventListener("fullscreenchange", () => this.requestUpdate())
  }

  static styles = css`
    :host {
      /* Setting a background is recommended since the backdrop of the fullscreen is black by default */
      background: white;
    }
  `

  get isFullscreen() {
    return this.ownerDocument.fullscreenElement === this
  }

  render() {
    return html`
      <textarea></textarea>
      <button id="fullscreen" @click=${() => !this.isFullscreen? this.requestFullscreen(): this.ownerDocument.exitFullscreen()}>Toggle Fullscreen</button>
    ` // this could be any complex widget template
  }

}
```

### Notes
- `contenteditable` is always removed by WebWriter during fullscreen.
- You can use any functions, events, etc. supported by the [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) to implement your own functionality.