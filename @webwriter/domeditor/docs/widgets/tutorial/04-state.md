# 4. State and participation

[Manage state](../guides/state.md)

Remember the reader’s chosen dance move and let participants share it in a live session.

## Store the selected move in a data block

Give the widget a place to read and write the selected move. Replace the test markup with the version below, which starts with an empty `move` field in the JSON data block.

**`index.html`**

```html
<ww-ghost-disco id="ghost-disco" shared>
  <p>Join the midnight dance party.</p>
  <script type="application/json" slot="data">{"move":""}</script>
</ww-ghost-disco>
```

## Read and write the move

Turn the stored move into a ghost pose and a status message. Create `disco/reading.js` and wait for the current data block before enabling the buttons. On click, read the latest snapshot and preserve the other JSON fields when you write the move.

**`disco/reading.js`**

```js
export function readDance(data, ready, error) {
  if(!ready || !data) {
    return {move: "", ready: false, status: error?.message || "Waiting for dance data…"}
  }

  try {
    const {move} = JSON.parse(data)
    if(move === "float") return {move, ready, status: "The ghost floats!"}
    if(move === "twirl") return {move, ready, status: "The ghost twirls!"}
    return {move: "", ready, status: "Pick a dance move."}
  }
  catch {
    return {move: "", ready: false, status: "The dance data is invalid."}
  }
}

export function chooseDance(runtime, move) {
  const {editable, data, dataReady, dataError} = runtime.getSnapshot()
  if(editable || !readDance(data, dataReady, dataError).ready) return
  runtime.setData("application/json", JSON.stringify({...JSON.parse(data), move}))
}
```

Merge this import alias into the package manifest. Keep your existing widget export and editing configuration.

**`package.json`**

```json package
{
  "imports": {
    "#disco-reading": "./disco/reading.js"
  }
}
```

<!-- library:vanilla optional -->
Add the runtime dependency to the existing `dependencies` map in `package.json`.

**`package.json`**

```json package
{
  "dependencies": {
    "@webwriter/widget": "^1.0.0"
  }
}
```
<!-- /library -->

<!-- library:react optional -->
Add the runtime dependency to the existing `dependencies` map in `package.json`.

**`package.json`**

```json package
{
  "dependencies": {
    "@webwriter/react": "^1.0.0"
  }
}
```
<!-- /library -->

<!-- library:vue optional -->
Add the runtime dependency to the existing `dependencies` map in `package.json`.

**`package.json`**

```json package
{
  "dependencies": {
    "@webwriter/vue": "^1.0.0"
  }
}
```
<!-- /library -->

<!-- library:angular optional -->
Add the runtime dependency to the existing `dependencies` map in `package.json`.

**`package.json`**

```json package
{
  "dependencies": {
    "@webwriter/angular": "^1.0.0"
  }
}
```
<!-- /library -->

<!-- library:svelte optional -->
Add the runtime dependency to the existing `dependencies` map in `package.json`.

**`package.json`**

```json package
{
  "dependencies": {
    "@webwriter/svelte": "^1.0.0"
  }
}
```
<!-- /library -->

## Connect the buttons to the data

Make each button save its move and update the dance floor from the data block.

<!-- library:vanilla optional -->
Add the imports and change the class base to `withWidgetRuntime(HTMLElement)`. Remove the observed-attributes list, `attributeChangedCallback()`, and `updateMode()`. Replace `connectedCallback()` and add the other methods below. Keep the registration and shadow markup.

**`ww-ghost-disco.js`**

```js
import {withWidgetRuntime} from "@webwriter/widget"
import {readDance, chooseDance} from "#disco-reading"
```

**`ww-ghost-disco.js`**

```js
connectedCallback() {
  super.connectedCallback()
  this.unsubscribe = this.widgetRuntime.subscribe(() => this.update())
  this.update()
}

disconnectedCallback() {
  this.unsubscribe?.()
  super.disconnectedCallback()
}

update() {
  const {editable, data, dataReady, dataError} = this.widgetRuntime.getSnapshot()
  const {move, ready, status} = readDance(data, dataReady, dataError)
  const root = this.shadowRoot
  root.querySelector(".controls").hidden = editable
  root.querySelector(".author-hint").hidden = !editable
  root.querySelector(".ghost").dataset.move = move
  root.querySelector("output").textContent = status
  for(const button of root.querySelectorAll(".controls button")) {
    button.disabled = !ready
    button.setAttribute("aria-pressed", String(button.value === move))
  }
}
```

Add the click listeners at the end of the constructor, after the shadow markup is in place.

**`ww-ghost-disco.js`**

```js
for(const button of this.shadowRoot.querySelectorAll(".controls button")) {
  button.addEventListener("click", () => chooseDance(this.widgetRuntime, button.value))
}
```
<!-- /library -->

<!-- library:lit optional -->
Import `readDance` from the helper. Add the error property and data callbacks to the class. They keep the error message current when the data scope changes. Then replace `render()`.

**`ww-ghost-disco.js`**

```js
import {readDance} from "#disco-reading"
```

**`ww-ghost-disco.js`**

```js
static properties = {error: {state: true}}

dataPending() { this.error = undefined }
dataChanged() { this.error = undefined }
dataError(error) { this.error = error }

choose(move) {
  if(this.editable || !readDance(this.data, this.dataReady, this.error).ready) return
  this.data = JSON.stringify({...JSON.parse(this.data), move})
}
```

**`ww-ghost-disco.js`**

```js
render() {
  const {move, ready, status} = readDance(this.data, this.dataReady, this.error)
  return html`
    <div class="stage">
      <slot><p>Join the midnight dance party.</p></slot>
      <span class="ghost" aria-hidden="true" data-move="${move}">👻</span>
      <div class="controls" ?hidden=${this.editable}>
        <button type="button" value="float" ?disabled=${!ready} aria-pressed=${move === "float"} @click=${() => this.choose("float")}>Float</button>
        <button type="button" value="twirl" ?disabled=${!ready} aria-pressed=${move === "twirl"} @click=${() => this.choose("twirl")}>Twirl</button>
      </div>
      <p class="author-hint" ?hidden=${!this.editable}>Edit the invitation in the document.</p>
      <output aria-live="polite">${status}</output>
    </div>`
}
```
<!-- /library -->

<!-- library:react optional -->
Replace the `createRoot` import with the imports below. Replace the component and remove the old custom element class. The adapter mounts the component and `useWidget()` updates it when the data or editing mode changes. Keep the style string.

**`ww-ghost-disco.jsx`**

```jsx
import {createReactWidget, useWidget} from "@webwriter/react"
import {readDance, chooseDance} from "#disco-reading"

function GhostDisco({host}) {
  const {editable: editing, data, dataReady, dataError} = useWidget(host)
  const {move, ready, status} = readDance(data, dataReady, dataError)
  const choose = move => chooseDance(host.widgetRuntime, move)
  return (
    <div className="stage">
      <style>{styles}</style>
      <slot><p>Join the midnight dance party.</p></slot>
      <span className="ghost" aria-hidden="true" data-move={move}>👻</span>
      <div className="controls" hidden={editing}>
        <button type="button" value="float" disabled={!ready} aria-pressed={move === "float"} onClick={() => choose("float")}>Float</button>
        <button type="button" value="twirl" disabled={!ready} aria-pressed={move === "twirl"} onClick={() => choose("twirl")}>Twirl</button>
      </div>
      <p className="author-hint" hidden={!editing}>Edit the invitation in the document.</p>
      <output aria-live="polite">{status}</output>
    </div>
  )
}
```

Register the class returned by the adapter.

**`ww-ghost-disco.jsx`**

```jsx
customElements.define("ww-ghost-disco", createReactWidget(GhostDisco))
```
<!-- /library -->

<!-- library:vue optional -->
Replace the registration module so the adapter can expose widget state. In the component, replace the script and template. Keep the styles.

**`ww-ghost-disco.js`**

```js
import {createVueWidget} from "@webwriter/vue"
import GhostDisco from "./ww-ghost-disco.vue"

customElements.define("ww-ghost-disco", createVueWidget(GhostDisco))
```

**`ww-ghost-disco.vue`**

```vue
<script setup>
import {computed, useHost} from "vue"
import {useWidget} from "@webwriter/vue"
import {readDance, chooseDance} from "#disco-reading"

const host = useHost()
const widget = useWidget(host)
const editing = computed(() => widget.value.editable)
const dance = computed(() => {
  const {data, dataReady, dataError} = widget.value
  return readDance(data, dataReady, dataError)
})
const status = computed(() => dance.value.status)
const choose = move => chooseDance(host.widgetRuntime, move)
</script>

<template>
  <div class="stage">
    <slot><p>Join the midnight dance party.</p></slot>
    <span class="ghost" aria-hidden="true" :data-move="dance.move">👻</span>
    <div class="controls" :hidden="editing">
      <button type="button" value="float" :disabled="!dance.ready" :aria-pressed="dance.move === 'float'" @click="choose('float')">Float</button>
      <button type="button" value="twirl" :disabled="!dance.ready" :aria-pressed="dance.move === 'twirl'" @click="choose('twirl')">Twirl</button>
    </div>
    <p class="author-hint" :hidden="!editing">Edit the invitation in the document.</p>
    <output aria-live="polite">{{ status }}</output>
  </div>
</template>
```
<!-- /library -->

<!-- library:angular optional -->
Use the Angular widget adapter to mount the component and inject its host and state. Replace the imports, component, and registration as shown. Move the existing CSS from the decorator to a `const styles` template string before the registration line.

**`ww-ghost-disco.ts`**

```ts
import "@angular/compiler"
import {Component, computed} from "@angular/core"
import {createAngularWidget, injectWidget, injectWidgetHost} from "@webwriter/angular"
import {readDance, chooseDance} from "#disco-reading"

@Component({
  standalone: true,
  template: `
    <div class="stage">
      <slot><p>Join the midnight dance party.</p></slot>
      <span class="ghost" aria-hidden="true" [attr.data-move]="dance().move">👻</span>
      <div class="controls" [hidden]="widget().editable">
        <button type="button" value="float" [disabled]="!dance().ready" [attr.aria-pressed]="dance().move === 'float'" (click)="choose('float')">Float</button>
        <button type="button" value="twirl" [disabled]="!dance().ready" [attr.aria-pressed]="dance().move === 'twirl'" (click)="choose('twirl')">Twirl</button>
      </div>
      <p class="author-hint" [hidden]="!widget().editable">Edit the invitation in the document.</p>
      <output aria-live="polite">{{ status() }}</output>
    </div>
  `,
})
class GhostDisco {
  private readonly host = injectWidgetHost()
  readonly widget = injectWidget()
  readonly dance = computed(() => {
    const {data, dataReady, dataError} = this.widget()
    return readDance(data, dataReady, dataError)
  })
  readonly status = computed(() => this.dance().status)

  choose(move: "float" | "twirl") { chooseDance(this.host.widgetRuntime, move) }
}
```

**`ww-ghost-disco.ts`**

```ts
customElements.define("ww-ghost-disco", await createAngularWidget(GhostDisco, {styles}))
```
<!-- /library -->

<!-- library:svelte optional -->
Replace the custom element options and script blocks with these. The store updates the component when the data or editing mode changes. Replace the stage markup and keep the styles.

**`ww-ghost-disco.svelte`**

```svelte
<script module>
import {widgetStore, withWidgetRuntime} from "@webwriter/svelte"
import {readDance, chooseDance} from "#disco-reading"
</script>

<svelte:options customElement={{ tag: "ww-ghost-disco", extend: withWidgetRuntime }} />

<script>
  const host = $host()
  const widget = widgetStore(host)
  const editing = $derived($widget.editable)
  const {move, ready, status} = $derived(readDance($widget.data, $widget.dataReady, $widget.dataError))
  const choose = move => chooseDance(host.widgetRuntime, move)
</script>
```

**`ww-ghost-disco.svelte`**

```svelte
<div class="stage">
  <slot><p>Join the midnight dance party.</p></slot>
  <span class="ghost" aria-hidden="true" data-move={move}>👻</span>
  <div class="controls" hidden={editing}>
    <button type="button" value="float" disabled={!ready} aria-pressed={move === "float"} onclick={() => choose("float")}>Float</button>
    <button type="button" value="twirl" disabled={!ready} aria-pressed={move === "twirl"} onclick={() => choose("twirl")}>Twirl</button>
  </div>
  <p class="author-hint" hidden={!editing}>Edit the invitation in the document.</p>
  <output aria-live="polite">{status}</output>
</div>
```
<!-- /library -->

Append these rules to the shadow styles. The selected move changes the ghost's pose and marks its button as pressed.

<!-- library:vanilla optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:lit optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:react optional -->
**`ww-ghost-disco.jsx`**
<!-- /library -->

<!-- library:vue optional -->
**`ww-ghost-disco.vue`**
<!-- /library -->

<!-- library:angular optional -->
**`ww-ghost-disco.ts`**
<!-- /library -->

<!-- library:svelte optional -->
**`ww-ghost-disco.svelte`**
<!-- /library -->

```css
.ghost[data-move="float"] { transform: translateY(-.3rem); }
.ghost[data-move="twirl"] { transform: rotate(24deg); }
button[aria-pressed="true"] { outline: 2px solid currentColor; outline-offset: 2px; }
```

## Share participant data

[Share participant data](../guides/sharing.md)

Give readers the same move through the `shared` attribute in the markup above. Set `sharedData` in the existing widget entry to enable participation. Remove `shared` for separate participant data.

**`package.json`**

```json package
{
  "editingConfig": {
    "./widgets/ww-ghost-disco": {
      "sharedData": true
    }
  }
}
```

## Rebuild and try sharing

Check that a move chosen in one preview appears in the other. The widget now imports a helper module, so build the package before refreshing it in WebWriter.

<!-- library:vanilla optional -->
Save the [build script](../examples/disco/build.mjs) as `build.mjs` beside the manifest. Update the widget export to point to the build output. Keep your existing dependencies and settings.

**`package.json`**

```json package
{
  "exports": {
    "./widgets/ww-ghost-disco.js": "./dist/ww-ghost-disco.js"
  },
  "scripts": {
    "build": "node build.mjs"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```
<!-- /library -->

<!-- library:lit optional -->
Save the [build script](../examples/disco/build.mjs) as `build.mjs` beside the manifest. Update the widget export to point to the build output. Keep your existing dependencies and settings.

**`package.json`**

```json package
{
  "exports": {
    "./widgets/ww-ghost-disco.js": "./dist/ww-ghost-disco.js"
  },
  "scripts": {
    "build": "node build.mjs"
  },
  "devDependencies": {
    "esbuild-wasm": "^0.25.12"
  }
}
```
<!-- /library -->

**Terminal**

```sh prompt
npm install
npm run build
```

In the result, choose **Shared** and **Reading**, then select **Float** or **Twirl**. Remove `shared` in **HTML** and check that each participant can now choose separately.

## Results

<!-- live-example: Ghost Disco · Shared dance moves -->

<!-- live-package: 01-setup.md 02-rendering.md . -->

<!-- live-file: react build.mjs ../examples/react/build.mjs -->

<!-- live-file: vue build.mjs ../examples/vue/build.mjs -->

<!-- live-file: angular build.mjs ../examples/angular/build.mjs -->

<!-- live-file: svelte build.mjs ../examples/svelte/build.mjs -->

<!-- live-file: vanilla build.mjs ../examples/disco/build.mjs -->

<!-- live-file: lit build.mjs ../examples/disco/build.mjs -->

<!-- live-file: vue compile.mjs ../examples/vue/compile.mjs -->

<!-- live-source: vanilla ../examples/disco/04-disco-sharing.js -->

<!-- live-source: lit ../examples/disco/lit/04-disco-sharing.js -->

<!-- live-source: react ../examples/disco/react/04-disco-sharing.jsx -->

<!-- live-source: vue ../examples/disco/vue/04-disco-sharing.vue -->

<!-- live-source: vue-registration ../examples/disco/vue/04-disco-sharing.js -->

<!-- live-source: angular ../examples/disco/angular/04-disco-sharing.ts -->

<!-- live-source: svelte ../examples/disco/svelte/04-disco-sharing.svelte -->

<!-- live-source: shared-disco-reading ../examples/disco/reading.js -->

```html shared
<ww-ghost-disco id="ghost-disco" shared>
  <p>Join the midnight dance party.</p>
  <script type="application/json" slot="data">{"move":""}</script>
</ww-ghost-disco>
```

<!-- /live-example -->
