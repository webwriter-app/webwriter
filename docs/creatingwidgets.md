---
order: 3
---
# Guide: Creating a widget

## Introduction
Widgets are what makes up a WebWriter document. Developers create widgets while authors, users and analysts interact with them. This guide explains how to implement a widget from a developer perspective.

This guide assumes you use the `ts-lit-vite` setup from the [quick start guide](quickstart.md). For other setups, see the [guide on other libraries](./usingotherlibraries.md).

### The target environment: What you need to know
Viewed technically, widgets are Custom Elements. This means a widget can support any and every web technology capable of running in the browser. This includes [standard web APIs](https://developer.mozilla.org/en-US/docs/Web/API), [JS packages/modules for the browser](https://www.npmjs.com/), and so on.
As each widget comes in a Package (see the [package guide](./creatingpackages.md) for more infos) that is loaded and bundled with `esbuild` when a document is saved, 
[all content types of esbuild are supported](https://esbuild.github.io/content-types/).
**Practically, this means you can use JavaScript-adjacent technology such TypeScript, CSS, JSON and more.**

## Prerequisites
You have...
- [ ] ...completed the [quick start guide](./quickstart.md)
- [ ] ...basic knowledge of [Lit](https://lit.dev/) and [TypeScript](https://www.typescriptlang.org/) (for the examples)


## Improving your widget with features

### Rendering: Display your widget to users and authors
Arguably the most basic feature is giving the widget a render function so it can be displayed.

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

*Note: In the following examples, we will omit the imports for readability.*

### Statefulness: Allow users to save their progress
Usually, you want users to be able to save their progress. To support this, all state must be stored as attributes of the widget's custom element, or as child nodes.

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

#### Notes
- Please note that [attributes are different from properties](https://stackoverflow.com/a/6004028) and properties will not be saved.

### `editable`: Allow authors to customize your widget
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
      :host([editable]) .placeholder {
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

### Use a part-based layout
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
      :host([editable]) .placeholder {
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

### `printable`: Allow users to print your widget
Sometimes, users and authors may want to fall back to printed versions of documents. Only some widgets work well in a printed representation.

For example, we could let the interactive textarea become simply a box with a black outline where (paper) users can write text:

```ts
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  value: string

  @property({attribute: true})
  placeholder: string

  static get styles() {
    return css`
      :host([editable]) .placeholder {
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

#### Notes
- Links could be represented as QR codes.
- If the widget can't be represented properly, `printable=true` could simply mean showing a hint to that effect.
- [Media queries (`@media print`)](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries) can also be used to support printing.

### `analyzable`: Allow analysts to observe interaction with your widget
Not implemented yet...

### `focus()`: Handle when the widget receives focus
To improve the authoring experience and accessibility for keyboard users, the widget should react sensibly when receiving focus. Usually, this means delegating the focus to a child element.

In our example, we implement `focus()` on the element such that the `textarea` is focused when the widget is focused:
```ts
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  value: string

  @property({attribute: true})
  placeholder: string

  @query("textarea")
  textarea: HTMLTextAreaElement

  focus(options: FocusOptions) {
    this.slInputElement?.focus(options)
  }

  static get styles() {
    return css`
      :host([editable]) .placeholder {
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