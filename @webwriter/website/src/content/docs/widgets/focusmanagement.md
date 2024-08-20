---
title: Managing Focus
order: 303
---

# Managing Focus
To improve the authoring experience and accessibility for keyboard users, the widget should react sensibly when receiving focus.

## `focus()`: Handle when the widget receives focus
A simple way of handling focus is delegating the focus to a child element.

In our example, we implement `focus()` on the element such that the `textarea` is focused when the widget is focused:
```ts
@customElement("cool-widget")
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  accessor value: string

  @property({attribute: true})
  accessor placeholder: string

  @query("textarea")
  accessor textarea: HTMLTextAreaElement

  focus(options: FocusOptions) {
    this.textarea?.focus(options)
  }

  static get styles() {
    return css`
      :host(:is([contenteditable=true], [contenteditable=""])) .placeholder {
        display: none;
      }

      :host(.ww-beforeprint) textarea {
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