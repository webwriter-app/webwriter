# 1. Set up the widget

<!-- library:vanilla -->
Create a folder containing `package.json` and `ww-quiz.js`.

**`package.json`**

```json
{
  "name": "@webwriter/quiz",
  "version": "1.0.0",
  "keywords": ["webwriter-widget"],
  "exports": {"./widgets/ww-quiz.js": "./ww-quiz.js"}
}
```



**`ww-quiz.js`**

```js
class WwQuiz extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = "<p>Quiz widget</p>"
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
```



Add the folder through **Developer console → Add package → Add from local folder**, then insert **Quiz**. You should see “Quiz widget”.
<!-- /library -->

<!-- library:lit -->
Create a folder containing `package.json` and `ww-quiz.js`.

**`package.json`**


```json
{
  "name": "@webwriter/quiz",
  "version": "1.0.0",
  "keywords": ["webwriter-widget"],
  "dependencies": {"@webwriter/lit": "^3.0.0", "lit": "^3.3.2"},
  "exports": {"./widgets/ww-quiz.js": "./ww-quiz.js"}
}
```


**`ww-quiz.js`**


```js
import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"

class WwQuiz extends LitElementWw {
  render() {
    return html`<p>Quiz widget</p>`
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
```


Add the folder through **Developer console → Add package → Add from local folder**, then insert **Quiz**. You should see “Quiz widget”. `LitElementWw` extends Lit and supplies WebWriter widget behavior, including `editable`, inherited language updates, and scoped-data hooks.
<!-- /library -->

<!-- library:react -->
Create a widget folder with the manifest below. Copy the complete script at the end of this page into `ww-quiz.jsx`.

**`package.json`**

```json
{
  "name": "@webwriter/quiz-react",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-quiz.js": "./dist/ww-quiz.js"
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

<!-- include:../examples/react/01-setup.md -->

Save [build.mjs](../examples/react/build.mjs) beside your source and manifest. React's npm entry modules use CommonJS, so bundle its dependencies before loading or refreshing the package:

```bash
npm install
npm run build
```

<details><summary>Build script</summary>

<!-- script:../examples/react/build.mjs -->

</details>

Add the folder through **Developer console → Add package → Add from local folder**, then insert **Quiz**. You should see “Quiz widget”.
<!-- /library -->

<!-- library:vue -->
Create a widget folder with the manifest below. Save the complete component as `ww-quiz.vue` and its registration module as `ww-quiz.js`. Change the registration module’s component import to `./ww-quiz.vue`.

**`package.json`**

```json
{
  "name": "@webwriter/quiz-vue",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-quiz.js": "./dist/ww-quiz.js"
  },
  "dependencies": {
    "vue": "^3.5.44"
  },
  "scripts": {"build": "node build.mjs"},
  "devDependencies": {"@vue/compiler-sfc": "^3.5.44", "esbuild-wasm": "^0.25.12"}
}
```

<!-- include:../examples/vue/01-setup.md -->

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

Add the folder through **Developer console → Add package → Add from local folder**, then insert **Quiz**. You should see “Quiz widget”.
<!-- /library -->

<!-- library:angular -->
Create a widget folder with the manifest below. Copy the complete script at the end of this page into `ww-quiz.ts`.

**`package.json`**

```json
{
  "name": "@webwriter/quiz-angular",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-quiz.js": "./dist/ww-quiz.js"
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

<!-- include:../examples/angular/01-setup.md -->

Save [build.mjs](../examples/angular/build.mjs) beside the source and manifest. It compiles the source into the browser-ready export in `dist/`. Run these commands in your widget folder before loading or refreshing the package:

```bash
npm install
npm run build
```

<details><summary>Build script</summary>

<!-- script:../examples/angular/build.mjs -->

</details>

Add the folder through **Developer console → Add package → Add from local folder**, then insert **Quiz**. You should see “Quiz widget”.
<!-- /library -->

<!-- library:svelte -->
Create a widget folder with the manifest below. Copy the complete script at the end of this page into `ww-quiz.svelte`.

**`package.json`**

```json
{
  "name": "@webwriter/quiz-svelte",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-quiz.js": "./dist/ww-quiz.js"
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

<!-- include:../examples/svelte/01-setup.md -->

Save [build.mjs](../examples/svelte/build.mjs) beside the source and manifest. It compiles the source into the browser-ready export in `dist/`. Run these commands in your widget folder before loading or refreshing the package:

```bash
npm install
npm run build
```

<details><summary>Build script</summary>

<!-- script:../examples/svelte/build.mjs -->

</details>

Add the folder through **Developer console → Add package → Add from local folder**, then insert **Quiz**. You should see “Quiz widget”.
<!-- /library -->

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/01-setup.js -->

<!-- library:vue -->
**Registration module**

<!-- script:../examples/vue/01-setup.js -->
<!-- /library -->

</details>

<iframe title="Step 1: quiz scaffold" src="../examples/preview.html?step=1" width="100%" height="130" loading="lazy"></iframe>

Next: [render the interface](02-rendering.md).
