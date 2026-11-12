# 1. Set up the widget

Create a [local package](https://docs.npmjs.com/about-packages-and-modules/) for **Ghost Disco**. The widget is a [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) with the name `ww-ghost-disco`. This version displays a placeholder.

<!-- library:vanilla -->
Save the [complete script](#complete-script) as `ww-ghost-disco.js` in your package folder. Save this manifest as `package.json`.

```json
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

The browser runs this JavaScript without a build step.
<!-- /library -->

<!-- library:lit -->
Save the [complete script](#complete-script) as `ww-ghost-disco.js` in your package folder. Save this manifest as `package.json`.

```json
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

The browser runs this JavaScript without a build step.
<!-- /library -->

<!-- library:react -->
Save the [complete script](#complete-script) as `ww-ghost-disco.jsx` in your package folder. Save this manifest as `package.json`.

```json
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

Save [build.mjs](../examples/react/build.mjs) beside the manifest. Install the dependencies. Then build the widget.

```sh
npm install
npm run build
```
<!-- /library -->

<!-- library:vue -->
Save the [complete script](#complete-script) as `ww-ghost-disco.vue` in your package folder. Save this manifest as `package.json`.

```json
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

Save the registration module under **Complete script** as `ww-ghost-disco.js`. Change its component import to `./ww-ghost-disco.vue`.

Save [build.mjs](../examples/vue/build.mjs) and [compile.mjs](../examples/vue/compile.mjs) beside the manifest. Install the dependencies. Then build the widget.

```sh
npm install
npm run build
```
<!-- /library -->

<!-- library:angular -->
Save the [complete script](#complete-script) as `ww-ghost-disco.ts` in your package folder. Save this manifest as `package.json`.

```json
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

Save [build.mjs](../examples/angular/build.mjs) beside the manifest. Install the dependencies. Then build the widget.

```sh
npm install
npm run build
```
<!-- /library -->

<!-- library:svelte -->
Save the [complete script](#complete-script) as `ww-ghost-disco.svelte` in your package folder. Save this manifest as `package.json`.

```json
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

Save [build.mjs](../examples/svelte/build.mjs) beside the manifest. Install the dependencies. Then build the widget.

```sh
npm install
npm run build
```
<!-- /library -->

In WebWriter, open **Developer console → Add package → Add from local folder**. Select the package folder. Insert the widget. Make sure that the widget displays **Ghost Disco widget**.

[Open the preview](../examples/preview.html?example=ghost-disco&step=1)

<iframe title="Ghost Disco placeholder" src="../examples/preview.html?example=ghost-disco&amp;step=1" width="100%" height="360" loading="lazy"></iframe>

Continue with [2. Render the interface](02-rendering.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/01-disco-setup.js -->

<!-- library:vue optional -->
**Vue registration module**

<!-- script:../examples/vue/01-disco-setup.js -->
<!-- /library -->

</details>
