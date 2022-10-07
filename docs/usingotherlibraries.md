#### Choose your own web component library
There are [many approaches to create web components](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/) other than Lit. While those are technically supported, you may run into unknown issues employing these.

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

The minimum requirement for a widget is the [`HTMLElement` interface](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement). This would be an uneditable and stateless widget:

```ts
@customElement("cool-widget")
export default class CoolWidget extends HTMLElement {
  // Implementation depending on your web component approach
}
```

While technically possible, this is not really useful: We want widgets to be editable so authors can customize them, and we want them to be stateful so users can save their progress:

```ts
import {BlockElement} from "webwriter-model"
import {LitElementWw} from "webwriter-lit"

@customElement("cool-widget")
export default class CoolWidget extends LitElementWw implements Widget {
  // Implementation depending on your web component approach (Lit in this example)
}
```

Above, we introduced two aspects:

- `Widget` is the interface widgets should support. It defines three core boolean properties that widgets may support: 
1. `editable`: If `true`, the widget should render UI elements so that authors can edit the widget. If `false`, no such UI elements should be rendered.
2. `printable`: If `true`, the widget should render itself so that it may be printed easily.
3. `analyzable`: Not implemented yet...

- `LitElementWw` is class saving you some boilerplate code by including useful features:
1. Core properties as attributes: The three core properties of BlockElement are boolean attributes of the custom element.
2. Scoped Custom Element Registry: [ScopedElementsMixin](https://open-wc.org/docs/development/scoped-elements/) is used to avoid name collisions between two widgets using the same third-party web components.
3. Rehydration: Custom elements based on LitElementWw will be set to the state of their attributes when loaded.

## Q & A

### How do I use technology not supported by esbuild?
As mentioned before, only [content types of esbuild are supported](https://esbuild.github.io/content-types/). If you want to use something else, such as SASS, Elm, etc., you need to add a build step to your package. 
Take SASS for example: `esbuild` only supports importing `.css`, not `.scss`. To solve this, you could use the CLI `sass` to compile `.scss` files down to `.css` files first, then import those in your main file.

### How do I use other Web Components in LitElementWW?