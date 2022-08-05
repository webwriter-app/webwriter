# Guide: Creating a widget

## Introduction



## Creating your widget

1. In your main file, create a base class that is also the default export, by either: 
  a. Using [Lit](https://lit.dev/) and the base class LitElementWw
  b. Or using [any other way of making a Web Component](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/)
2. Implement your component to support the BlockElement API


Approach | Key Advantage | Libraries
HTMLElement* | Minimum bundle size and no dependencies (no library needed) | HTMLElement
Class-based | Balance between easy development and being lightweight | Lit, Slim, HyperHTML
Object-based | Similar to class-based but uses object syntax with create function | Hybrids
Hook-based | Allows using the hook-based API popularized by React | Haunted, Atomico
Compiled | Lots of syntactic sugar possible due to compilation step | Stencil, Svelte, Solid
Wrapped** | Use known non-standard components (Vue, React, …) | Vue3, preact-custom-element, react-to-webcomponent, Riot
Other** | -  | twind

\* A more DIY approach, other libraries such as lit can be mixed in for features like templating
** Not recommended: Large bundle size since whole Vue/React/… runtime must be bundled