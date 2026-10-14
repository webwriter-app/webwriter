# Use libraries and assets

A widget can use native web APIs or a library that produces custom elements.

<!-- library:vanilla -->
The [tutorial](../tutorial/index.md) uses `HTMLElement`; Lit is another option in the header's library selector.
<!-- /library -->
<!-- library:lit -->
The [tutorial](../tutorial/index.md) uses Lit. Select **JS** in the header for the implementation using `HTMLElement` directly.
<!-- /library -->

<!-- library:react -->
The tutorial uses JSX function components, React hooks, and `createRoot` inside a native custom-element wrapper. Keep the mount inside shadow DOM and unmount it when the widget disconnects. Bundle React and React DOM's CommonJS npm modules using the supplied build script before publishing. The build script compiles JSX before publishing.
<!-- /library -->
<!-- library:vue -->
The tutorial uses Vue single-file components with `<script setup>`, a `<template>`, and `<style>`. A small registration module calls `defineCustomElement`. The supplied scripts compile the component in custom-element mode, inline its shadow styles, and bundle Vue before publishing.
<!-- /library -->
<!-- library:angular -->
The tutorial uses Angular Elements with shadow encapsulation and a native slot. Its TypeScript classes use `@Component` and `@Input` decorators. The build script compiles TypeScript and bundles the Angular runtime and template compiler into browser-ready modules. WebWriter loads those modules; it does not build Angular source when adding a package.
<!-- /library -->
<!-- library:svelte -->
The tutorial uses Svelte's custom-element compiler. Its build script compiles `.svelte` components and bundles their runtime into browser-ready modules. WebWriter loads the built exports; it does not compile `.svelte` source when adding a package.
<!-- /library -->

Declare framework dependencies in `dependencies`. Import them by their bare specifiers; the supplied builds compile source formats and bundle the runtime where needed:

<!-- library:vanilla -->
```js
import {LitElement, html} from "lit"
```
<!-- /library -->
<!-- library:lit -->
```js
import {LitElement, html} from "lit"
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

`@webwriter/build` keeps shared dependencies as imports. WebWriter resolves compatible versions through the document's import map. Use `prebuiltDependencies` for dependencies that must be bundled, such as CommonJS code.

Render widget UI in shadow DOM. When using `LitElementWw`, register third-party shadow components through `static scopedElements` to avoid global name collisions.

Export document-level widget CSS separately. An export such as `./widgets/ww-quiz.*` loads the matching script and stylesheet. Include any theme required by your component library.

For static files served beside your module, use a module-relative URL:

```js
const imageUrl = new URL("./moon.svg", import.meta.url).href
```

Include the file in the published package. Check preview and saved HTML; arbitrary network requests made by a widget are outside automatic offline bundling. See [distribution](../reference/distribution.md).
