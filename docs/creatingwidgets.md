# Guide: Creating a widget

## Introduction
Widgets are what makes up a WebWriter document. Developers create widgets while authors, users and analysts interact with them. This guide explains how to implement a widget from a developer perspective.

### The target environment: What you need to know
Viewed technically, widgets are Custom Elements. This means a widget can support any and every web technology capable of running in the browser. This includes [standard web APIs](https://developer.mozilla.org/en-US/docs/Web/API), [JS packages/modules for the browser](https://www.npmjs.com/), and so on.
As each widget comes in a Package (see the [package guide](./creatingpackages.md) for more infos) that is loaded and bundled with `esbuild` when a document is saved, 
[all content types of esbuild are supported](https://esbuild.github.io/content-types/).
Practically, this means you can use JavaScript-adjacent technology such TypeScript, CSS, JSON and more.

## Prerequisites
You completed the [package guide](./creatingpackages.md) and already have a package set up for your widget. You are familiar with [Lit](https://lit.dev/) and [TypeScript](https://www.typescriptlang.org/) (for the examples).

## Creating your widget

### Step 1: Choose a web component approach for your widget

First, you need to choose how you want to create your widget's custom element.

#### Get started with Lit and LitElementWw (Recommended)
We recommend using Lit and LitElementWw since it is a decent tradeoff between ease of development and being lightweight.

If you develop with TypeScript, we recommend you use the official package `webwriter-model`, which provides types to make developing widgets easier. If you also use Lit to develop, we additionally recommend `webwriter-lit` for a useful boilerplate class `LitElementWw` to base your widget on.

```sh
npm install -s webwriter-model webwriter-lit
```

#### Choose your own web component library
There are [many approaches to create web components](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/) other than Lit. While those are technically supported, you may run into unknown issues employing thes

For alternatives, refer to this table:

Approach | Key Advantage | Libraries
HTMLElement* | Minimum bundle size and no dependencies (no library needed) | [HTMLElement](https://html.spec.whatwg.org/multipage/custom-elements.html)
Class/Object-based | Balance between easy development and being lightweight | [Lit](https://lit.dev/), [Slim](https://slimjs.com), [HyperHTML](https://github.com/WebReflection/hyperHTML-Element), [Hybrids](https://hybrids.js.org)
Hook-based | Allows using the hook-based API popularized by React | [Haunted](https://github.com/matthewp/haunted), [Atomico](https://atomico.gitbook.io/doc/)
Compiled | Lots of syntactic sugar possible due to compilation step | [Stencil](https://stenciljs.com/), [Svelte](https://svelte.dev/), [Solid](https://github.com/ryansolid/solid)
Wrapped** | Use known non-standard components (Vue, React/Preact) | [Vue3](https://vuejs.org/guide/extras/web-components.html), [preact-custom-element](https://github.com/preactjs/preact-custom-element), [react-to-webcomponent](https://www.npmjs.com/package/react-to-webcomponent)
Other | -  | [twind](https://twind.dev/)

\* A more DIY approach, other libraries such as lit can be mixed in for features like templating
** Not recommended: Large bundle size since whole Vue/React/… runtime must be bundled

### Step 2: Define the core widget
The minimum requirement for a widget is the [`HTMLElement` interface](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement). This would be an uneditable and stateless widget:

```ts
export default class CoolWidget extends HTMLElement {
  // Implementation depending on your web component approach
}
```

While technically possible, this is not really useful: We want widgets to be editable so authors can customize them, and we want them to be stateful so users can save their progress:

```ts
import {BlockElement} from "webwriter-model"
import {LitElementWw} from "webwriter-lit"

export default class CoolWidget extends LitElementWw implements BlockElement {
  // Implementation depending on your web component approach (Lit in this example)
}
```
Above, we introduced two aspects:

- `BlockElement` is the interface widgets should support. It defines three core boolean properties that widgets may support: 
1. `editable`: If `true`, the widget should render UI elements so that authors can edit the widget. If `false`, no such UI elements should be rendered.
2. `printable`: If `true`, the widget should render itself so that it may be printed easily.
3. `analyzable`: Not implemented yet...

- `LitElementWw` is class saving you some boilerplate code by including useful features:
1. Core properties as attributes: The three core properties of BlockElement are boolean attributes of the custom element.
2. Scoped Custom Element Registry: [ScopedElementsMixin](https://open-wc.org/docs/development/scoped-elements/) is used to avoid name collisions between two widgets using the same third-party web components.
3. Rehydration: Custom elements based on LitElementWw will be set to the state of their attributes when loaded.

### Step 3: Implementing widget features

As an example, we will work with Lit and LitElementWw. We start out with this class definition (note we are leaving out the `implements BlockElement` for now because it is already included in `LitElementWw`):

```ts
import {LitElementWw} from "webwriter-lit"
import {html, css} from "lit"
import {property, query} from "lit/decorators.js"

export default class CoolWidget extends LitElementWw {

}
```

That is technically a widget, but totally useless: Without a template, nothing is displayed when using the widget. Let us look at how to add some features to this widget.

*Note: In the following examples, we will omit the imports for readability.*

#### Rendering: Display your widget to users and authors
Arguably the most basic feature is giving the widget a render function so it can be displayed.

In this example, we simply render a [vanilla `textarea` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea) into the widget:

```ts
export default class CoolWidget extends LitElementWw {
  render() {
    return html`<textarea></textarea>`
  }
}
```

#### Statefulness: Allow users to save their progress
Usually, you want users to be able to save their progress. To support this, all state must be stored as attributes of the widget's custom element. 

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

##### Notes
- Please note that [attributes are different from properties](https://stackoverflow.com/a/6004028) and properties will not be saved.

#### `editable`: Allow authors to customize your widget
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

##### Use a part-based layout
As an extra feature, WebWriter can display your widget's editing elements separately from the widget's content.

For this, the widget's content element needs the attribute `part="base"` and the widget's editing element needs the attribute `part="action"`. Each should be a single element and a direct child of the widget. Additionally, the widget itself must be set to `display: contents`.

To accomplish this for our example above, we add the `part="base"` and `part="action"` attributes to the respective elements, and add a `display: contents` rule to the CSS:

```ts
export default class CoolWidget extends LitElementWw {

  @property({attribute: true})
  value: string

  @property({attribute: true})
  placeholder: string

  static get styles() {
    return css`
      :host {
        display: contents;
      }

      :host([editable]) .placeholder {
        display: none;
      }
    `
  }

  render() {
    return html`
    <input part="action" class="placeholder" @change=${e => this.placeholder = e.target.value}></input>
    <textarea part="base" @change=${e => this.value = e.target.value} placeholder=${this.placeholder}>
      ${this.value}
    </textarea>`
  }
}
```

##### Notes
- The part-based layout is preferable for more complex widgets since it makes better use of screen space in WebWriter.
- To have multiple elements for the `action` and `base` parts, simply add a wrapper element (`<div part="action">...</div>`).

#### `printable`: Allow users to print your widget
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
      :host {
        display: contents;
      }

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
    <textarea part="base" @change=${e => this.value = e.target.value} placeholder=${this.placeholder}>
      ${this.value}
    </textarea>`
  }
}
```

##### Notes
- Links could be represented as QR codes.
- If the widget can't be represented properly, `printable=true` could simply mean showing a hint to that effect.
- [Media queries (`@media print`)](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries) can also be used to support printing.

#### `analyzable`: Allow analysts to observe interaction with your widget
Not implemented yet...

#### `focus()`: Handle when the widget receives focus
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
      :host {
        display: contents;
      }

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
    <textarea part="base" @change=${e => this.value = e.target.value} placeholder=${this.placeholder}>
      ${this.value}
    </textarea>`
  }
}
```

## Q & A

### How do I use technology not supported by esbuild?
As mentioned before, only [content types of esbuild are supported](https://esbuild.github.io/content-types/). If you want to use something else, such as SASS, Elm, etc., you need to add a build step to your package. 
Take SASS for example: `esbuild` only supports importing `.css`, not `.scss`. To solve this, you could use the CLI `sass` to compile `.scss` files down to `.css` files first, then import those in your main file.