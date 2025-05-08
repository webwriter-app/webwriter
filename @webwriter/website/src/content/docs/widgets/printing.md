---
title: Printing
order: 306
---

# Printing
Sometimes, authors may want to fall back to printed versions of explorables.


## class `ww-beforeprint`: Provide a printable view
Before an explorable is printed, the `ww-beforeprint` class is applied to each widget. Widget developers can use this to prepare the widget display for printing.

For example, we could let the interactive textarea become simply a box with a black outline where (paper) users can write text:

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
      :host(:not(:is([contenteditable=true], [contenteditable=""]))) .placeholder {
        display: none;
      }

      :host(.ww-printable) textarea {
        border: 2px solid black;
        border-radius: 2px;
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

### Notes
- Only some widgets work well in a printed representation. If the widget can't be represented properly, `ww-beforeprint` could simply mean showing a hint to that effect.
- Links could be represented as QR codes.
- [Media queries (`@media print`)](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries) can also be used to support printing.