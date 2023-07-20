---
title: "Saving and Editing"
order: 102
---

# Saving and Editing
Usually, you want users to be able to save their progress. Also, you may decide that some options of your widget should only be accessible to authors, but not to users. This sections outlines how to save widget state and how to limit options to authors.


## Saving widget state
 To support saving, all state must be stored as **attributes** of the widget's custom element, or as **child nodes**. Anything else, including properties and the content of the shadow DOM, will not be saved.

In this example, we save our textarea's content in an attribute `value` which we create with Lit, also adding a change listener on the `textarea`:

```ts
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  value: string

  render() {
    return html`<textarea @change=${e => this.value = e.target.value}>
      ${this.value}
    </textarea>`
  }
}
```

### Notes
- Please note that [attributes are different from properties](https://stackoverflow.com/a/6004028) and properties will not be saved.
- This allows learners to save their changes locally just using the save function of their web browser since browsers implement the same behavior of persisting attributes.

## `editable`: Limit options to authors
With statefulness, we already allow authors to "prefill" the widget with some state. But often, authors should be able to customize widgets further than users, allowing more complex interaction with the widget than would be reasonable for users.

For example, we may want to add the ability for authors to add a placeholder text to the textarea that is shown when it is empty. To accomplish that, we add a `placeholder` attribute, an `input` element and CSS to make sure the `input` element is only shown when the widget is being edited (`editable`):

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
    <input class="placeholder" @change=${e => this.placeholder = e.target.value}></input>
    <textarea @change=${e => this.value = e.target.value} placeholder=${this.placeholder}>
      ${this.value}
    </textarea>`
  }
}
```

## Separate editor widget
Not supported yet
