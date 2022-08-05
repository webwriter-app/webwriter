# Guide: Creating a widget

## Introduction



## Creating your widget


### Step 1: Choose an approach for your web component

In your main file, create a class that is also the default export, by either: 
  a. Using [Lit](https://lit.dev/) and the class LitElementWw (`npm install webwriter-lit`, then `import {LitElementWw} from "webwriter-lit"` in your code)
  b. Or using [any other way of making a Web Component](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/)

We recommend using Lit. For alternatives, refer to this table:

Approach | Key Advantage | Libraries
HTMLElement* | Minimum bundle size and no dependencies (no library needed) | HTMLElement
Class/Object-based | Balance between easy development and being lightweight | Lit, Slim, HyperHTML, Hybrids
Hook-based | Allows using the hook-based API popularized by React | Haunted, Atomico
Compiled | Lots of syntactic sugar possible due to compilation step | Stencil, Svelte, Solid
Wrapped** | Use known non-standard components (Vue, React, …) | Vue3, preact-custom-element, react-to-webcomponent, Riot
Other | -  | twind

\* A more DIY approach, other libraries such as lit can be mixed in for features like templating
** Not recommended: Large bundle size since whole Vue/React/… runtime must be bundled

### Step 2: Implement
, and [all content types of esbuild are supported](https://esbuild.github.io/content-types/)

### Step 4: \[Optional\] Installing WebWriter utilities
If you develop with TypeScript, we recommend you use the official package `webwriter-model`, which provides types to make developing widgets easier. If you also use Lit to develop

```sh
npm install -s webwriter-model webwriter-lit
```