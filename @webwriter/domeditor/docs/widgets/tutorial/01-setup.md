# 1. Set up the widget

Make **Ghost Disco** available in WebWriter as a widget that displays a placeholder. Create a [local package](https://docs.npmjs.com/about-packages-and-modules/) for the [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) `ww-ghost-disco`. Select a library in the sidebar before you copy the files. You will need Node.js and npm to build and test the package in later steps.

## Declare the widget in the package

Tell WebWriter which module to load for `ww-ghost-disco`. Create a folder for the package and save the following manifest as `package.json`. The `webwriter-widget` keyword identifies the package. The key `./widgets/ww-ghost-disco.js` gives the widget its name, and its value points to the module.

<!-- library:vanilla -->

**`package.json`**

```json package
{
  "name": "@example/ghost-disco",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-ghost-disco.js": "./ww-ghost-disco.js"
  }
}
```
<!-- /library -->

<!-- library:lit -->

**`package.json`**

```json package
{
  "name": "@example/ghost-disco-lit",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-ghost-disco.js": "./ww-ghost-disco.js"
  },
  "dependencies": {
    "@webwriter/lit": "^3.0.0",
    "lit": "^3.3.2"
  }
}
```
<!-- /library -->

<!-- library:react -->

**`package.json`**

```json package
{
  "name": "@example/ghost-disco-react",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget",
    "widget-practical",
    "widget-lang-en"
  ],
  "exports": {
    "./widgets/ww-ghost-disco.js": "./dist/ww-ghost-disco.js"
  },
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "scripts": {
    "build": "node build.mjs ghost-disco"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```
<!-- /library -->

<!-- library:vue -->

**`package.json`**

```json package
{
  "name": "@example/ghost-disco-vue",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget",
    "widget-practical",
    "widget-lang-en"
  ],
  "exports": {
    "./widgets/ww-ghost-disco.js": "./dist/ww-ghost-disco.js"
  },
  "dependencies": {
    "vue": "^3.5.44"
  },
  "scripts": {
    "build": "node build.mjs ghost-disco"
  },
  "devDependencies": {
    "@vue/compiler-sfc": "^3.5.44",
    "esbuild-wasm": "^0.25.12"
  }
}
```
<!-- /library -->

<!-- library:angular -->

**`package.json`**

```json package
{
  "name": "@example/ghost-disco-angular",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget",
    "widget-practical",
    "widget-lang-en"
  ],
  "exports": {
    "./widgets/ww-ghost-disco.js": "./dist/ww-ghost-disco.js"
  },
  "dependencies": {
    "@angular/compiler": "^22.2.2",
    "@angular/core": "^22.2.2",
    "@angular/elements": "^22.2.2",
    "@angular/platform-browser": "^22.2.2",
    "rxjs": "^7.8.2",
    "@angular/common": "^22.2.2"
  },
  "scripts": {
    "build": "node build.mjs ghost-disco"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```
<!-- /library -->

<!-- library:svelte -->

**`package.json`**

```json package
{
  "name": "@example/ghost-disco-svelte",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget",
    "widget-practical",
    "widget-lang-en"
  ],
  "exports": {
    "./widgets/ww-ghost-disco.js": "./dist/ww-ghost-disco.js"
  },
  "dependencies": {
    "svelte": "^5.57.2"
  },
  "scripts": {
    "build": "node build.mjs ghost-disco"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```
<!-- /library -->

## Create and register the custom element

Give the `ww-ghost-disco` tag a class that renders the placeholder.

<!-- library:vanilla optional -->
Save this file as `ww-ghost-disco.js`. Extend `HTMLElement`. In the constructor, call `super()` before you attach an open shadow root. Put the placeholder in the shadow root and register the class.

**`ww-ghost-disco.js`**

```js
class WwGhostDisco extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = "<p>Ghost Disco widget</p>"
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
```
<!-- /library -->

<!-- library:lit optional -->
Save this file as `ww-ghost-disco.js`. Extend `LitElementWw`. Return the placeholder from `render()`. Lit creates the shadow root and renders the template when the element connects.

**`ww-ghost-disco.js`**

```js
import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"

class WwGhostDisco extends LitElementWw {
  render() { return html`<p>Ghost Disco widget</p>` }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
```
<!-- /library -->

<!-- library:react optional -->
Save this file as `ww-ghost-disco.jsx`. Define a component that renders the placeholder. Create the React root when the host connects and unmount it when the host disconnects.

**`ww-ghost-disco.jsx`**

```jsx
import {createRoot} from "react-dom/client"

function GhostDisco() {
  return <p>Ghost Disco widget</p>
}

class WwGhostDisco extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"})
  }

  connectedCallback() {
    this.root = createRoot(this.shadowRoot)
    this.refresh()
  }

  disconnectedCallback() {
    this.root.unmount()
    this.root = null
  }

  refresh() {
    this.root.render(<GhostDisco />)
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
```
<!-- /library -->

<!-- library:vue optional -->
Save this file as `ww-ghost-disco.vue`. Put the placeholder in the component template. In the registration module, adapt the component with `defineCustomElement()` and register the resulting class.

**`ww-ghost-disco.vue`**

```vue
<template>
  <p>Ghost Disco widget</p>
</template>
```

Save the module beside the component. Keep the import relative to this file.

**`ww-ghost-disco.js`**

```js
import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./ww-ghost-disco.vue"

const WwGhostDisco = defineCustomElement(GhostDisco)

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
```
<!-- /library -->

<!-- library:angular optional -->
Save this file as `ww-ghost-disco.ts`. Declare a standalone component with shadow DOM encapsulation. Adapt it with `createCustomElement()`. The host removes Angular's runtime version stamp from the saved markup.

**`ww-ghost-disco.ts`**

```ts
import "@angular/compiler"
import {Component, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

@Component({
  selector: "ww-ghost-disco-view",
  standalone: true,
  template: "<p>Ghost Disco widget</p>",
  encapsulation: ViewEncapsulation.ShadowDom,
})
class GhostDisco {}

const app = await createApplication()
const AngularGhostDiscoElement = createCustomElement(GhostDisco, {injector: app.injector}) as unknown as {
  new(): HTMLElement & {connectedCallback(): void}
}
class GhostDiscoElement extends AngularGhostDiscoElement {
  connectedCallback(): void {
    const version = this.getAttribute("ng-version")
    super.connectedCallback()
    // Keep Angular's runtime stamp out of the authored document.
    if(version === null) this.removeAttribute("ng-version")
    else this.setAttribute("ng-version", version)
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", GhostDiscoElement)
```
<!-- /library -->

<!-- library:svelte optional -->
Save this file as `ww-ghost-disco.svelte`. Set the tag in `<svelte:options>`. The build compiles this file as a custom element. Put the placeholder after the options.

**`ww-ghost-disco.svelte`**

```svelte
<svelte:options customElement={{ tag: "ww-ghost-disco" }} />

<p>Ghost Disco widget</p>
```
<!-- /library -->

## Load the package and check the placeholder

Confirm that inserting the widget in WebWriter displays **Ghost Disco widget**.

<!-- library:vanilla optional -->
Load the JavaScript module through the package export. The JS version uses browser APIs.
<!-- /library -->

<!-- library:lit optional -->
Load the JavaScript module through the package export. The manifest declares the Lit dependencies so WebWriter can resolve the imports.
<!-- /library -->

<!-- library:react optional -->
Save [build.mjs](../examples/react/build.mjs) beside the manifest. Install the dependencies. Then build the widget.

**Terminal**

```sh prompt
npm install
npm run build
```

Check that the build created `dist/ww-ghost-disco.js`. This is the file named in the widget export.
<!-- /library -->

<!-- library:vue optional -->
Save [build.mjs](../examples/vue/build.mjs) and [compile.mjs](../examples/vue/compile.mjs) beside the manifest. Install the dependencies. Then build the widget.

**Terminal**

```sh prompt
npm install
npm run build
```

Check that the build created `dist/ww-ghost-disco.js`. This is the file named in the widget export.
<!-- /library -->

<!-- library:angular optional -->
Save [build.mjs](../examples/angular/build.mjs) beside the manifest. Install the dependencies. Then build the widget.

**Terminal**

```sh prompt
npm install
npm run build
```

Check that the build created `dist/ww-ghost-disco.js`. This is the file named in the widget export.
<!-- /library -->

<!-- library:svelte optional -->
Save [build.mjs](../examples/svelte/build.mjs) beside the manifest. Install the dependencies. Then build the widget.

**Terminal**

```sh prompt
npm install
npm run build
```

Check that the build created `dist/ww-ghost-disco.js`. This is the file named in the widget export.
<!-- /library -->

In WebWriter, open **Developer console → Add package → Add from local folder**. Select the folder that contains `package.json` and insert Ghost Disco in a document. In the live example, switch to **package.json** to check the manifest and back to **Source** to check the registration.

## Results

<!-- live-example: Ghost Disco · Set up the widget -->

<!-- live-package: . -->

<!-- live-file: react build.mjs ../examples/react/build.mjs -->

<!-- live-file: vue build.mjs ../examples/vue/build.mjs -->

<!-- live-file: angular build.mjs ../examples/angular/build.mjs -->

<!-- live-file: svelte build.mjs ../examples/svelte/build.mjs -->

<!-- live-file: vue compile.mjs ../examples/vue/compile.mjs -->

<!-- live-source: vanilla ../examples/01-disco-setup.js -->

<!-- live-source: lit ../examples/lit/01-disco-setup.js -->

<!-- live-source: react ../examples/react/01-disco-setup.jsx -->

<!-- live-source: vue ../examples/vue/01-disco-setup.vue -->

<!-- live-source: vue-registration ../examples/vue/01-disco-setup.js -->

<!-- live-source: angular ../examples/angular/01-disco-setup.ts -->

<!-- live-source: svelte ../examples/svelte/01-disco-setup.svelte -->

```html
<ww-ghost-disco></ww-ghost-disco>
```

<!-- /live-example -->
