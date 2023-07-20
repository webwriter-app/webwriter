---
title: Printing
order: 106
---

# Printing
Sometimes, users and authors may want to fall back to printed versions of Explorables.


## `printable`: Allow users to print your widget
Before an explorable is printed, the `printable` attribute is applied to each widget. Widget developers can use this to prepare the widget display for printing.

For example, we could let the interactive textarea become simply a box with a black outline where (paper) users can write text:

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

      :host([printable]) textarea {
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
- Only some widgets work well in a printed representation. If the widget can't be represented properly, `printable=true` could simply mean showing a hint to that effect.
- Links could be represented as QR codes.
- [Media queries (`@media print`)](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries) can also be used to support printing.