# 6. Support collaboration

<!-- library:vanilla -->
Move the temporary choice into scoped data. Add `sharedData: true` beside `content` in the editing configuration, then add a direct data block to the widget:

```html
<ww-quiz answer="false" shared>
  <p>The Moon is a star.</p>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

`shared` makes everyone use the same answers. Remove it for individual answers. Group sharing is covered in the [sharing guide](../guides/sharing.md).

Replace the `choice` property with a getter and a current-block query:



```js
get block() {
  return this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
}

get choice() {
  try { return JSON.parse(this.block?.textContent || "{}").choice ?? "" }
  catch { return "" }
}
```

Listen for `datachange` to render accepted snapshots, including the initial state and remote changes. Disable answering until the initial event. Then write the current block in `choose()`:

```js
choose(value) {
  const block = this.block
  if(this.isContentEditable || !block || block !== this.readyBlock) return
  const state = JSON.parse(block.textContent || "{}")
  block.textContent = JSON.stringify({...state, choice: value})
}
```

Use the [complete script](#complete-script) for event filtering, initialization, and error handling. It rechecks the current block before each write and leaves the question and other children intact. Network connections and persistence belong to the document runtime.



These two embedded widgets use the real scoped-data runtime with a shared in-memory connection. Choose an answer in either one; both should update. To test across browsers, load the package into a connected WebWriter document. Normal exports retain the empty default choice.
<!-- /library -->

<!-- library:lit -->
Move the temporary choice into scoped data. Add `sharedData: true` beside `content` in the editing configuration, then add a direct data block to the widget:

```html
<ww-quiz answer="false" shared>
  <p>The Moon is a star.</p>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

`shared` makes everyone use the same answers. Remove it for individual answers. Group sharing is covered in the [sharing guide](../guides/sharing.md).

With `LitElementWw`, handle the data lifecycle through methods instead of adding event listeners or querying the data block. The base calls `dataPending`, `dataChanged(rawText, context)`, and `dataError` with a `{block, mode}` context. It tracks readiness through `dataReady` and keeps `data` connected to the current data block:

```js
static properties = {answer: {type: String, reflect: true}, error: {state: true}}

constructor() {
  super()
  this.answer = "false"
  this.error = ""
}

dataPending(context) { this.error = "" }

dataChanged(rawText, context) {
  this.error = ""
}

dataError(error, context) { this.error = error.message }

get choice() {
  try { return JSON.parse(this.data || "{}").choice ?? "" }
  catch { return "" }
}
```

The base calls `dataChanged` for the initial value and accepted local or remote updates; its update request refreshes the template after each snapshot. `dataPending` runs while the current scope loads, and `dataError` reports a failure. The `choice` getter reads the current data text. Write through `this.data` in `choose()` after `dataReady` becomes true:

```js
choose(value) {
  if(this.editable || !this.dataReady) return
  const state = JSON.parse(this.data || "{}")
  this.data = JSON.stringify({...state, choice: value})
}
```

In `render()`, disable the answer buttons while `!this.dataReady || this.editable`. Reactive state updates the feedback after each accepted snapshot; rendering itself never writes data. The complete script also displays `error`. Network connections and persistence belong to the document runtime.


These two embedded widgets use the real scoped-data runtime with a shared in-memory connection. Choose an answer in either one; both should update. To test across browsers, load the package into a connected WebWriter document. Normal exports retain the empty default choice.
<!-- /library -->

<!-- library:react -->
Move the temporary choice into scoped data. Add `sharedData: true` beside `content` in the editing configuration, then add a direct data block to the widget:

```html
<ww-quiz answer="false" shared>
  <p>The Moon is a star.</p>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

`shared` makes everyone use the same answers. Remove it for individual answers. Group sharing is covered in the [sharing guide](../guides/sharing.md).

<!-- include:../examples/react/06-collaboration.md -->

The two embedded widgets use the real scoped-data runtime with a shared in-memory connection. Choose an answer in either one; both should update. Network connections and persistence belong to the document runtime. Normal exports retain the empty default choice.

After editing the source, run `npm run build` before refreshing your local package. The embedded preview builds its imports automatically.
<!-- /library -->

<!-- library:vue -->
Move the temporary choice into scoped data. Add `sharedData: true` beside `content` in the editing configuration, then add a direct data block to the widget:

```html
<ww-quiz answer="false" shared>
  <p>The Moon is a star.</p>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

`shared` makes everyone use the same answers. Remove it for individual answers. Group sharing is covered in the [sharing guide](../guides/sharing.md).

<!-- include:../examples/vue/06-collaboration.md -->

The two embedded widgets use the real scoped-data runtime with a shared in-memory connection. Choose an answer in either one; both should update. Network connections and persistence belong to the document runtime. Normal exports retain the empty default choice.

Replace `ww-quiz.vue` with this step’s complete component and `ww-quiz.js` with its registration module. Keep the component import in the registration module set to `./ww-quiz.vue`. After editing either file, run `npm run build` before refreshing your local package. The embedded preview compiles them automatically.
<!-- /library -->

<!-- library:angular -->
Move the temporary choice into scoped data. Add `sharedData: true` beside `content` in the editing configuration, then add a direct data block to the widget:

```html
<ww-quiz answer="false" shared>
  <p>The Moon is a star.</p>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

`shared` makes everyone use the same answers. Remove it for individual answers. Group sharing is covered in the [sharing guide](../guides/sharing.md).

<!-- include:../examples/angular/06-collaboration.md -->

The two embedded widgets use the real scoped-data runtime with a shared in-memory connection. Choose an answer in either one; both should update. Network connections and persistence belong to the document runtime. Normal exports retain the empty default choice.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<!-- library:svelte -->
Move the temporary choice into scoped data. Add `sharedData: true` beside `content` in the editing configuration, then add a direct data block to the widget:

```html
<ww-quiz answer="false" shared>
  <p>The Moon is a star.</p>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

`shared` makes everyone use the same answers. Remove it for individual answers. Group sharing is covered in the [sharing guide](../guides/sharing.md).

<!-- include:../examples/svelte/06-collaboration.md -->

The two embedded widgets use the real scoped-data runtime with a shared in-memory connection. Choose an answer in either one; both should update. Network connections and persistence belong to the document runtime. Normal exports retain the empty default choice.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/06-collaboration.js -->

<!-- library:vue -->
**Registration module**

<!-- script:../examples/vue/06-collaboration.js -->
<!-- /library -->

</details>

[Final package manifest](../examples/package.json)

<iframe title="Step 6: two participants sharing answers" src="../examples/preview.html?step=6" width="100%" height="410" loading="lazy"></iframe>

Next: [test and publish](07-testing-publishing.md).
