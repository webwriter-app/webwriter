---
title: "Saving and Editing"
order: 302
---

# Saving and Editing
Usually, you want users to be able to save their progress. Also, you may decide that some options of your widget should only be accessible to authors, but not to users. This sections outlines how to save widget state and how to limit options to authors.


## Saving widget state
 To support saving, all state must be stored as **attributes** of the widget's custom element, or as **child nodes**. Anything else, including properties and the content of the shadow DOM, will not be saved.

In this example, we save our textarea's content in an attribute `value` which we create with Lit, also adding a change listener on the `textarea`:

```ts
@customElement("cool-widget")
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  accessor value: string

  render() {
    return html`<textarea @change=${e => this.value = e.target.value}>
      ${this.value}
    </textarea>`
  }
}
```

### Undo/Redo
WebWriter also implements a global undo/redo system. It works by tracking changes in the DOM. Widgets can make use of this system by regularly updating their attributes to reflect the current widget state. 

### Notes
- Please note that [attributes are different from properties](https://stackoverflow.com/a/6004028) and properties will not be saved.
- This allows learners to save their changes locally just using the save function of their web browser since browsers implement the same behavior of persisting attributes.

### How can I test this?
When in an explorable with your widget, you can switch to "Edit source" mode, then switch back to normal editing. This will first cause WebWriter to parse the DOM into HTML shown in source mode. There, you can already observe if your attributes are present and correct. When you switch back, the HTML is parsed into a fresh DOM tree - the widget should be restored to the same state. If the widget appears different, you have some hidden state not stored in attributes.

## `contentEditable`: Limit options to authors
With statefulness, we already allow authors to "prefill" the widget with some state. But often, authors should be able to customize widgets further than users, allowing more complex interaction with the widget than would be reasonable for users.

For example, we may want to add the ability for authors to add a placeholder text to the textarea that is shown when it is empty. To accomplish that, we add a `placeholder` attribute, an `input` element and CSS to make sure the `input` element is only shown when the widget is being edited (`contentEditable`):

```ts
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
    <input class="author-only" @change=${e => this.placeholder = e.target.value}></input>
    <textarea @change=${e => this.value = e.target.value} placeholder=${this.placeholder}>
      ${this.value}
    </textarea>`
  }
}
```

### How can I test this?
Use the "Preview" function. This will show you the explorable as it would appear when saved, specifically removing the `contentEditable` attribute from all widgets.