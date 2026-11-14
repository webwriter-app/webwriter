# Quick start

Download and install [Node.js LTS with npm](https://nodejs.org/en/download) before you start. You also need a text editor and a browser that can open local folders in WebWriter, such as Chrome or Edge.

## Step 1: Set up the widget package

Make a folder for the widget. Save these files in that folder.

<!-- library:vanilla -->
**`package.json`**

```json package
{
  "name": "@webwriter/hello",
  "version": "1.0.0",
  "keywords": ["webwriter-widget"],
  "exports": {
    "./widgets/ww-hello.js": {"source": "./ww-hello.js", "default": "./dist/ww-hello.js"}
  }
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
**`package.json`**

```json package
{
  "name": "@webwriter/hello",
  "version": "1.0.0",
  "keywords": ["webwriter-widget"],
  "dependencies": {"@webwriter/lit": "^3.0.0", "lit": "^3.3.2"},
  "exports": {
    "./widgets/ww-hello.js": {"source": "./ww-hello.js", "default": "./dist/ww-hello.js"}
  }
}
```

**`ww-hello.js`**

```js
import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"

class WwHello extends LitElementWw {
  render() {
    return html`<p>Hello, <slot>world</slot>!</p>`
  }
}

if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHello)
```
<!-- /library -->

<!-- library:react -->
**`package.json`**

```json package
{
  "name": "@webwriter/hello-react",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": {"source": "./hello.jsx", "default": "./dist/ww-hello.js"}
  },
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  }
}
```

**`hello.jsx`**

<!-- script:../examples/hello.js -->

Save this file as `tsconfig.json`.

```json file tsconfig.json
{"compilerOptions": {"jsx": "react-jsx"}}
```
<!-- /library -->

<!-- library:vue -->
**`package.json`**

```json package
{
  "name": "@webwriter/hello-vue",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": {"source": "./hello.js", "default": "./dist/ww-hello.js"}
  },
  "dependencies": {
    "vue": "^3.5.44"
  },
  "devDependencies": {"@vue/compiler-sfc": "^3.5.44"}
}
```

**`hello.vue`**

<!-- script:../examples/hello.js -->

**`hello.js`**

```js file hello.js
import {defineCustomElement} from "vue"
import Hello from "./hello-component.js"

customElements.define("ww-hello", defineCustomElement(Hello))
```

Save this file as `compile.mjs`. It compiles the component to JavaScript.

```js file compile.mjs
import {readFile, writeFile} from "node:fs/promises"
import {parse, compileTemplate} from "@vue/compiler-sfc"

const filename = "hello.vue"
const {descriptor, errors} = parse(await readFile(filename, "utf8"), {filename})
if(errors.length) throw new Error(errors.join("\n"))

const template = compileTemplate({
  source: descriptor.template.content,
  filename,
  id: "ww-hello",
})
if(template.errors.length) throw new Error(template.errors.join("\n"))

await writeFile("hello-component.js", template.code + "\nexport default {render}\n")
```
<!-- /library -->

<!-- library:angular -->
**`package.json`**

```json package
{
  "name": "@webwriter/hello-angular",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": {"source": "./hello.ts", "default": "./dist/ww-hello.js"}
  },
  "dependencies": {
    "@angular/common": "^22.2.2",
    "@angular/compiler": "^22.2.2",
    "@angular/core": "^22.2.2",
    "@angular/elements": "^22.2.2",
    "@angular/platform-browser": "^22.2.2",
    "rxjs": "^7.8.2"
  }
}
```

**`hello.ts`**

<!-- script:../examples/hello.js -->

Save this file as `tsconfig.json`.

```json file tsconfig.json
{"compilerOptions": {"experimentalDecorators": true}}
```
<!-- /library -->

<!-- library:svelte -->
**`package.json`**

```json package
{
  "name": "@webwriter/hello-svelte",
  "version": "1.0.0",
  "keywords": [
    "webwriter-widget"
  ],
  "exports": {
    "./widgets/ww-hello.js": {"source": "./hello-component.js", "default": "./dist/ww-hello.js"}
  },
  "dependencies": {
    "svelte": "^5.57.2"
  }
}
```

**`hello.svelte`**

<!-- script:../examples/hello.js -->

Save this file as `compile.mjs`. It compiles the component to JavaScript.

```js file compile.mjs
import {readFile, writeFile} from "node:fs/promises"
import {compile} from "svelte/compiler"

const filename = "hello.svelte"
const source = await readFile(filename, "utf8")
const {js} = compile(source, {filename, generate: "client", customElement: true})
await writeFile("hello-component.js", js.code)
```
<!-- /library -->

Open a terminal in the widget folder. Install the dependencies listed in `package.json`.

```sh prompt
npm install
```

<!-- library:vue optional -->
Compile the Vue template.

```sh prompt
node compile.mjs
```
<!-- /library -->

<!-- library:svelte optional -->
Compile the Svelte component.

```sh prompt
node compile.mjs
```
<!-- /library -->

Start the development build. Wait for `dist/ww-hello.js` to appear. Keep the command running while you work.

```sh prompt
npx @webwriter/build dev
```

## Step 2: Insert the widget

1. Open the **Developer console** in WebWriter.
2. Select **Add package**.
3. Select **Add from local folder**.
4. Select the widget folder.
5. Insert **Hello** from the insertion menu.
6. Make sure that the widget shows “Hello, world!”.

## Step 3: Change the greeting

1. In the widget's markup, change the greeting from `Hello,` to `Welcome,`.
2. Save the file.

<!-- library:vue optional -->
In a second terminal in the widget folder, compile `hello.vue` again. The development build watches the generated JavaScript.

```sh prompt
node compile.mjs
```
<!-- /library -->

<!-- library:svelte optional -->
In a second terminal in the widget folder, compile `hello.svelte` again. The development build watches the generated JavaScript.

```sh prompt
node compile.mjs
```
<!-- /library -->

Wait for the development build to finish. With **Auto-reload** on, WebWriter loads the new widget code. You can also refresh the package manually.

Change the greeting to `Welcome,` in the widget source, or put your name between the tags in the HTML pane. The preview updates as you type.

<!-- live-example: Hello widget -->

<!-- live-package: . -->

<!-- live-build-files -->

<!-- live-source: vanilla ../examples/hello.js -->

<!-- live-source: lit ../examples/lit/hello.js -->

<!-- live-source: react ../examples/react/hello.jsx -->

<!-- live-source: vue ../examples/vue/hello.vue -->

<!-- live-source: vue-registration ../examples/vue/hello.js -->

<!-- live-source: angular ../examples/angular/hello.ts -->

<!-- live-source: svelte ../examples/svelte/hello.svelte -->

```html
<ww-hello></ww-hello>
```

<!-- /live-example -->
