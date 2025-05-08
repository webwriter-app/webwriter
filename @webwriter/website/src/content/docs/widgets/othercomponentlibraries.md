---
order: 311
title: "Using Other Libraries"
---

# Using Other Libraries

This guide summarizes options to use component libraries other than the recommended Lit to implement widgets.

## Choose your own web component library
There are [many approaches to create web components](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/) other than Lit. While those are technically supported, you may run into unknown issues employing these.

For some possibilities, refer to this table:

Approach | Key Advantage | Libraries
|--------|---------------|---------|
HTMLElement* | Minimum bundle size and no dependencies (no library needed) | [HTMLElement](https://html.spec.whatwg.org/multipage/custom-elements.html)
Class/Object-based | Balance between easy development and being lightweight | [Lit](https://lit.dev/), [Slim](https://slimjs.com), [HyperHTML](https://github.com/WebReflection/hyperHTML-Element), [Hybrids](https://hybrids.js.org)
Hook-based | Allows using the hook-based API popularized by React | [Haunted](https://github.com/matthewp/haunted), [Atomico](https://atomico.gitbook.io/doc/)
Compiled | Lots of syntactic sugar possible due to compilation step | [Stencil](https://stenciljs.com/), [Svelte](https://svelte.dev/), [Solid](https://github.com/ryansolid/solid)
Wrapped** | Use known non-standard components (Vue, React/Preact) | [Vue3](https://vuejs.org/guide/extras/web-components.html), [preact-custom-element](https://github.com/preactjs/preact-custom-element), [react-to-webcomponent](https://www.npmjs.com/package/react-to-webcomponent)

\* A more DIY approach, other libraries such as lit can be mixed in for features like templating

** Not recommended: Large bundle size since whole Vue/React/… runtime must be bundled


## Implement the basics of a widget

When using the recommended approach, we use the `LitElementWw` base class like so:
```ts
import {LitElementWw} from "webwriter-lit"

@customElement("cool-widget")
export default class CoolWidget extends LitElementWw  {
  // Implementation depending on your web component approach (Lit in this example)
}
```

What does this actually provide? `LitElementWw` is a class saving you some boilerplate code by including useful features:
1. Core properties as attributes: The core properties of `webwriter.Widget` are boolean attributes of the custom element.
2. Rehydration: Custom elements based on LitElementWw will be set to the state of their attributes when loaded.
3. Scoped Custom Element Registry: [ScopedElementsMixin](https://open-wc.org/docs/development/scoped-elements/) is used to avoid name collisions between two widgets using the same third-party web components. This is a technical issue with the current specification of custom elements. To put it shortly: Custom elements must be registered globally by their tag (e.g. `my-button`). Now, the name is taken and trying to register the element again throws an error. This makes having different versions of the same element in the same page very difficult. Essentially, this is a typical global namespace issue. You can read more about it [here](https://github.com/justinfagnani/webcomponents/blob/scoped-registries/proposals/Scoped-Custom-Element-Registries.md).

Why is this important? You need to implement these features with the web component library you want to use. (1) is usually very simple, almost any library provides this. (2) is also straightforward: Some libraries may do this automatically, otherwise, you can implement it with the [`connectedCallback` method](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements#using_the_lifecycle_callbacks), which is standardized and thus available with any library. (3) is probably the most difficult. You can check the page for the solution in Lit [here](https://open-wc.org/docs/development/scoped-elements/). This will hopefully become much easier once standardization progresses. 