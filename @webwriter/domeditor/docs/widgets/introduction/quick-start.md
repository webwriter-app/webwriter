# Quick start

This tutorial creates a small widget and loads it into WebWriter. You need a text editor and WebWriter running in a browser that supports opening local folders, such as Chrome or Edge.

## Step 1: Create the files

<!-- library:vanilla -->
Create a folder containing these two files:

**`package.json`**

```json
{
  "name": "@webwriter/hello",
  "version": "1.0.0",
  "keywords": ["webwriter-widget"],
  "exports": {"./widgets/ww-hello.js": "./ww-hello.js"}
}
```



**`ww-hello.js`**

```js
class WwHello extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = "<p>Hello, <slot>world</slot>!</p>"
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
```
<!-- /library -->

<!-- library:lit -->
Create a folder containing these two files:

**`package.json`**


```json
{
  "name": "@webwriter/hello",
  "version": "1.0.0",
  "keywords": ["webwriter-widget"],
  "dependencies": {"lit": "^3.3.2"},
  "exports": {"./widgets/ww-hello.js": "./ww-hello.js"}
}
```


**`ww-hello.js`**


```js
import {LitElement, html} from "lit"

class WwHello extends LitElement {
  render() {
    return html`<p>Hello, <slot>world</slot>!</p>`
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
```
<!-- /library -->

<!-- library:react -->
Create a widget folder with this manifest and a source file named `hello.jsx`.

**`package.json`**

```json
{
  "name": "@webwriter/hello-react",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": "./dist/ww-hello.js"
  },
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "scripts": {
    "build": "node build.mjs"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```

<!-- include:../examples/react/hello.md -->

**`hello.jsx`**

<!-- script:../examples/hello.js -->

Save [build.mjs](../examples/react/build.mjs) beside your source and manifest. React's npm entry modules use CommonJS, so bundle its dependencies before loading or refreshing the package:

```bash
npm install
npm run build
```

<details><summary>Build script</summary>

<!-- script:../examples/react/build.mjs -->

</details>
<!-- /library -->

<!-- library:vue -->
Create a widget folder with this manifest and a component named `hello.vue` and its registration module `hello.js`.

**`package.json`**

```json
{
  "name": "@webwriter/hello-vue",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": "./dist/ww-hello.js"
  },
  "dependencies": {
    "vue": "^3.5.44"
  },
  "scripts": {"build": "node build.mjs"},
  "devDependencies": {"@vue/compiler-sfc": "^3.5.44", "esbuild-wasm": "^0.25.12"}
}
```

<!-- include:../examples/vue/hello.md -->

**`hello.vue`**

<!-- script:../examples/hello.js -->

**`hello.js`**

<!-- script:../examples/vue/hello.js -->

Save [build.mjs](../examples/vue/build.mjs) and [compile.mjs](../examples/vue/compile.mjs) beside your source and manifest. The compiler builds the single-file component and bundles Vue into the browser-ready export:

```bash
npm install
npm run build
```

<details><summary>Build script</summary>

<!-- script:../examples/vue/build.mjs -->

</details>

<details><summary>Component compiler</summary>

<!-- script:../examples/vue/compile.mjs -->

</details>
<!-- /library -->

<!-- library:angular -->
Create a widget folder with this manifest and a source file named `hello.ts`.

**`package.json`**

```json
{
  "name": "@webwriter/hello-angular",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": "./dist/ww-hello.js"
  },
  "dependencies": {
    "@angular/common": "^22.2.2",
    "@angular/compiler": "^22.2.2",
    "@angular/core": "^22.2.2",
    "@angular/elements": "^22.2.2",
    "@angular/platform-browser": "^22.2.2",
    "rxjs": "^7.8.2"
  },
  "scripts": {
    "build": "node build.mjs"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```

<!-- include:../examples/angular/hello.md -->

**`hello.ts`**

<!-- script:../examples/hello.js -->

Save [build.mjs](../examples/angular/build.mjs) beside the source and manifest. It compiles the source into the browser-ready export in `dist/`. Run these commands in your widget folder before loading or refreshing the package:

```bash
npm install
npm run build
```

<details><summary>Build script</summary>

<!-- script:../examples/angular/build.mjs -->

</details>
<!-- /library -->

<!-- library:svelte -->
Create a widget folder with this manifest and a source file named `hello.svelte`.

**`package.json`**

```json
{
  "name": "@webwriter/hello-svelte",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": "./dist/ww-hello.js"
  },
  "dependencies": {
    "svelte": "^5.57.2"
  },
  "scripts": {
    "build": "node build.mjs"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```

<!-- include:../examples/svelte/hello.md -->

**`hello.svelte`**

<!-- script:../examples/hello.js -->

Save [build.mjs](../examples/svelte/build.mjs) beside the source and manifest. It compiles the source into the browser-ready export in `dist/`. Run these commands in your widget folder before loading or refreshing the package:

```bash
npm install
npm run build
```

<details><summary>Build script</summary>

<!-- script:../examples/svelte/build.mjs -->

</details>
<!-- /library -->

## Step 2: Insert the widget

Open the **Developer console**, then choose **Add package → Add from local folder**. Select your folder. Insert **Hello** from the insertion menu. The widget should display “Hello, world!”.

## Step 3: Change the greeting

Change `Hello` to `Welcome` in your source and save it. If your library needs a build step, run `npm run build` again. With **Auto-reload** enabled, WebWriter reloads the browser-ready widget. You can also refresh the package manually.

The example below shows the original greeting. Serve this repository with `npm start` to open its [standalone preview](../examples/hello.html).

<iframe title="Hello widget" src="../examples/hello.html" width="100%" height="100" loading="lazy"></iframe>

Next: [build a quiz widget](../tutorial/index.md).
