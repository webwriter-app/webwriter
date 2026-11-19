# Manage dependencies

A widget can use native web APIs or a framework that produces a browser-ready custom element. It can include styles and media, and it can share compatible dependencies with other widgets. It can load optional features when readers need them and select which features an offline export includes.

![Code and image assets connect to a widget](../../images/widgets/libraries.svg)

Try **Load orbit diagram**. The widget imports the optional module on the first request and reuses it on later requests. The demo stores the module in the example source so it can run inside the preview. In a package, put it in its own file.

<!-- live-example: On-demand orbit diagram -->

```js vanilla
const orbitModule = `
  export function drawOrbit() {
    return '<svg viewBox="0 0 160 64" width="160" role="img" aria-label="Planet on an orbit">'
      + '<ellipse cx="80" cy="32" rx="72" ry="24" fill="none" stroke="currentColor"/>'
      + '<circle cx="80" cy="32" r="9" fill="gold"/>'
      + '<circle cx="138" cy="18" r="6" fill="royalblue"/></svg>'
  }
`

class OrbitDemo extends HTMLElement {
  #module
  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    root.innerHTML = `
      <button type="button">Load orbit diagram</button>
      <p role="status">Optional module idle.</p>
      <div></div>
    `
    const button = root.querySelector("button")
    const status = root.querySelector("p")
    button.addEventListener("click", async () => {
      button.disabled = true
      status.textContent = "Loading optional module…"
      try {
        this.#module ??= this.loadDiagram()
        const {drawOrbit} = await this.#module
        root.querySelector("div").innerHTML = drawOrbit()
        status.textContent = "Optional module ready."
      } catch {
        this.#module = undefined
        status.textContent = "Could not load the diagram. Try again."
      } finally {
        button.disabled = false
      }
    })
  }

  async loadDiagram() {
    const url = URL.createObjectURL(new Blob([orbitModule], {type: "text/javascript"}))
    try { return await import(url) }
    finally { URL.revokeObjectURL(url) }
  }
}

customElements.define("ww-orbit-demo", OrbitDemo)
```

```html
<ww-orbit-demo></ww-orbit-demo>
```

<!-- /live-example -->

<!-- library:vanilla -->
The [tutorial](../tutorial/index.md) uses [`HTMLElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement) in its **JS** version. The library selector also offers [Lit](https://lit.dev/docs/components/overview/).
<!-- /library -->
<!-- library:lit -->
The [tutorial](../tutorial/index.md) uses `LitElementWw`. This base class gives access to edit mode, inherited language changes, and scoped data. Select **JS** in the library selector for the example that uses `HTMLElement` directly.
<!-- /library -->

<!-- library:react -->
The tutorial uses JSX function components, React hooks, and [`createRoot`](https://react.dev/reference/react-dom/client/createRoot) inside a native custom element. Mount the React component in the shadow DOM. Unmount it when the widget disconnects. Before publication, use the build script to compile JSX and bundle the CommonJS modules for React and React DOM.
<!-- /library -->
<!-- library:vue -->
The tutorial uses Vue single-file components with `<script setup>`, `<template>`, and `<style>`. The registration module calls [`defineCustomElement`](https://vuejs.org/api/custom-elements#definecustomelement). The build scripts compile the component in custom-element mode. They also include the shadow styles and bundle Vue.
<!-- /library -->
<!-- library:angular -->
The tutorial uses [Angular Elements](https://angular.dev/guide/elements) with shadow encapsulation and a native slot. Its TypeScript classes use `@Component` and `@Input` decorators. The build script compiles TypeScript. It also bundles the Angular runtime and template compiler. The authoring tool loads the browser-ready modules.
<!-- /library -->
<!-- library:svelte -->
The tutorial uses the [Svelte custom-element compiler](https://svelte.dev/docs/svelte/custom-elements). The build script compiles `.svelte` components and bundles their runtime. The authoring tool loads the browser-ready modules.
<!-- /library -->

Declare framework dependencies in [`dependencies`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#dependencies). Use bare module specifiers to import them. The build scripts compile the source files and bundle the runtime when necessary.

<!-- library:vanilla -->
```js
import {LitElement, html} from "lit"
```
<!-- /library -->
<!-- library:lit -->
```js
import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"
```
<!-- /library -->
<!-- library:react -->
```js
import {useState} from "react"
import {createRoot} from "react-dom/client"
```
<!-- /library -->
<!-- library:vue -->
```js
import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
```
<!-- /library -->
<!-- library:angular -->
```js
import {createCustomElement} from "@angular/elements"
```
<!-- /library -->
<!-- library:svelte -->
```js
import {onMount} from "svelte"
```
<!-- /library -->

`@webwriter/build` bundles dependencies into each widget by default. If the authoring tool supports shared dependencies, use `--shared-dependencies`. The document's import map resolves the imports for compatible dependencies. Use `prebuiltDependencies` for dependencies that must be in the bundle, such as CommonJS code.

<!-- library:lit -->
Declare `@webwriter/lit` and `lit` in `dependencies`. Register third-party shadow components with `static scopedElements` to prevent conflicts with global names.
<!-- /library -->

Render the widget interface in the shadow DOM.

Export document-level CSS separately. For example, a field guide can use `./widgets/ww-field-guide.*` for its script and stylesheet. Include the theme if the component library requires one.

Use a module-relative URL for a file in the same package as the module.

```js
const imageUrl = new URL("./fern.svg", import.meta.url).href
```

Include the file in the published package. Check that the file loads in preview and in saved HTML. The offline export can include resources that it can resolve from the package. Other network requests still require network access. See the [package manifest reference](../reference/distribution.md).

## Optimize the code bundle

Use [`import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) to load large optional features when readers need them. Offline HTML usually includes these modules so they can run without a network connection. If saved settings restrict the available features, use `static offlineImports(element)` to select the necessary modules and dependencies.

![A full bundle with four code blocks shrinks to a smaller bundle with one block](../../images/widgets/optimize-code-bundle.svg)

### Put optional features behind lazy imports

Put the optional features in a separate loader module. Use a literal module specifier in each `import()` call. In this example, `widgets/ww-simulation.js` is the widget entry. `simulations/loaders.js` contains the loaders.

```js
// simulations/loaders.js
export const loaders = {
  orbits: () => import("./orbits.js"),
  circuits: () => import("./circuits.js"),
}
```

### Select imports from the saved widget

Use the same rule to select features when the widget loads and when the document exports. The authoring tool calls the hook synchronously with a detached copy of the saved element. Read its attributes or light-DOM children. Keep the copy unchanged.

```js
// widgets/ww-simulation.js
import {loaders} from "../simulations/loaders.js"

const simulationType = element => element.getAttribute("type") ?? "orbits"

class WwSimulation extends HTMLElement {
  static offlineImports(element) {
    const type = simulationType(element)
    return [{
      importer: "../simulations/loaders.js",
      keep: Object.hasOwn(loaders, type) ? [`./${type}.js`] : [],
    }]
  }

  async loadSimulation() {
    const type = simulationType(this)
    if (Object.hasOwn(loaders, type)) return loaders[type]()
  }
}

customElements.define("ww-simulation", WwSimulation)
```

`importer` identifies the file with the `import()` calls relative to the published widget entry. Each `keep` value matches a specifier in one of those calls. For example, `./orbits.js` is relative to `loaders.js`. Make sure that the published package keeps the loader module and its dynamic imports. The build can also put code directly in a module. In that case, the code is part of that module.

The offline export includes the selections for each widget instance and insertable template. A document with an Orbits widget and a Circuits widget contains both simulations. Include all modes that readers can select offline. Return `keep: "*"` if readers need all modes. See the [runtime interface](../reference/runtime.md#offline-imports).

### Verify the offline export

1. Load the built widget in the authoring tool.
2. Select one variant.
3. Set a value that you can identify when you open the document again.
4. Save the document as **Offline HTML**.
5. Open the file in a browser with the network disabled.
6. Make sure that the selected variant starts and restores the saved state and settings.
7. Compare the file size with a document that includes all variants.
8. If an import fails with `OfflineImportError`, show a message that explains which variants are available offline.

## Run HTML in an isolated preview

Use `renderSandbox` from `@webwriter/widget/sandbox` to run user-supplied HTML and JavaScript. Bundle the helper with the widget. It needs no server or editor API at runtime.

### Create the preview

Put the iframe in the widget's shadow root and give it an accessible title.

```js
import {renderSandbox} from "@webwriter/widget/sandbox"

class HTMLPreview extends HTMLElement {
  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    this.frame = document.createElement("iframe")
    this.frame.title = "HTML preview"
    root.append(this.frame)
  }

  run(html) {
    renderSandbox(this.frame, html)
  }
}

customElements.define("ww-html-preview", HTMLPreview)
```

`renderSandbox(frame, html)` removes `src`, sets `sandbox="allow-scripts"`, and assigns a self-contained `srcdoc`. Each call starts a fresh preview. Remove the iframe when it is no longer needed.

The preview can change its own DOM but cannot access the widget's or editor's document. Keep the sandbox permissions set by the helper. Do not add `allow-same-origin` or other permissions.

### Check the host's content security policy

WebWriter authorizes the runner automatically. In another host with a content security policy (CSP), add the matching bootstrap hash and `strict-dynamic` to its existing `script-src` directive:

```js
import {sandboxScriptHash} from "@webwriter/widget/sandbox"

const runnerSources = `'${sandboxScriptHash}' 'strict-dynamic'`
```

Keep the host's other policy directives. Update the hash when updating the runner. A policy inside the iframe cannot override the host's policy.

### Include the preview in saved HTML

Bundle the sandbox module into the widget's output. For offline use, also embed the activity's images, stylesheets, scripts, and other resources.

To generate a standalone HTML file, call `renderSandbox` and include `frame.outerHTML` in the exported page. The serialized iframe includes the runner and HTML. It runs from disk without an import or server. If the exported page has a CSP, authorize the bootstrap hash there too.

### Check execution and offline use

Classic and module scripts run in sequence unless marked `async`. The preview does not reproduce browser parser or page-load timing.

- Register event handlers with `addEventListener`. Inline handlers such as `onclick` and `javascript:` URLs remain blocked by WebWriter's CSP.
- Avoid `document.write()` and code that depends on `DOMContentLoaded` or `load` timing.
- Use absolute URLs or embedded resources. WebWriter blocks a custom `<base>`. Resource, network, form, and module CORS policies still apply.
- Inline modules use a data URL, which is also their `import.meta.url`.

1. Run the built widget in the authoring tool and check the preview.
2. Run another snippet and check that it starts a fresh preview.
3. Save as **Offline HTML** and open the file with the network disabled.
4. Check that scripts run and the activity's resources load.
