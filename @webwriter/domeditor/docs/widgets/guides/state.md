# Manage state

WebWriter offers several ways to organize your widget's state.

Use properties for temporary state. Use attributes for settings that authors should save, share, and undo.

<!-- library:vanilla -->
```js
get answer() { return this.getAttribute("answer") ?? "false" }
set answer(value) { this.setAttribute("answer", value) }
```

Observe the attribute to update your display when a collaborator or undo changes it:

```js
static observedAttributes = ["answer"]

attributeChangedCallback() {
  this.update()
}
```
<!-- /library -->
<!-- library:lit -->
In your `LitElementWw` class, declare a reactive property and reflect its changes to an attribute:

```js
static properties = {answer: {type: String, reflect: true}}

constructor() {
  super()
  this.answer = "false"
}
```

Lit reads later attribute changes, including remote changes and undo, and updates the template. Use `{state: true}` for local reactive properties that should not become attributes.
<!-- /library -->

<!-- library:react -->
Keep saved settings on the custom-element host. Its bridge reads the current `answer` attribute and passes it to the React component whenever the attribute changes, including collaboration and undo. Use `useState` for the temporary participant choice:

```jsx
function Quiz({answer, editing}) {
  const [choice, setChoice] = useState("")
  return <button disabled={editing} onClick={() => setChoice("false")}>False</button>
}
```

The collaboration step reads persistent choices from the current data block and subscribes to the bridge with a hook. See [the state step](../tutorial/04-state.md) for the complete example.
<!-- /library -->

<!-- library:vue -->
Keep saved settings on the custom-element host. The registration bridge reads its `answer` attribute and notifies the single-file component when it changes, including collaboration and undo. Use Vue refs for temporary state and computed values for feedback:

```vue
<script setup>
import {computed, ref} from "vue"
const choice = ref("")
const answer = ref("false") // refreshed from the host by the complete bridge
const message = computed(() => choice.value ? (choice.value === answer.value ? "Correct!" : "Try again.") : "")
</script>
<template>
  <button @click="choice = 'false'">False</button>
  <output aria-live="polite">{{message}}</output>
</template>
```

The collaboration step reads persistent choices from the current data block. See [the state step](../tutorial/04-state.md) for the complete component and registration module.
<!-- /library -->

<!-- library:angular -->
Declare the saved setting as a decorated Angular input. Angular Elements maps the host's `answer` attribute to that input, so later attribute changes from collaboration or undo update the component. Keep the temporary choice on the component:

```ts
@Input() answer = "false"
choice = ""

choose(value: string) {
  if(!this.editing) this.choice = value
}
```

The collaboration step reads persistent choices from the current data block. See [the state step](../tutorial/04-state.md) for the complete component and native host bridge.
<!-- /library -->

<!-- library:svelte -->
Declare the saved setting as a reflected custom-element prop. Use local Svelte state for the temporary choice:

```svelte
<svelte:options customElement={{
  tag: "ww-quiz",
  props: {answer: {type: "String", reflect: true}},
}} />
<script>
  let {answer = "false"} = $props()
  let choice = $state("")
</script>
```

Later attribute changes update the component prop, including remote changes and undo. See [the state step](../tutorial/04-state.md) for the full example.
<!-- /library -->

A property that only reads an attribute does not save later property changes.

Keep authored text in light-DOM children. Use a [scoped data block](sharing.md) for persistent participant answers. Normal exports retain the block's authored defaults rather than participant answers.

To check settings, save and reopen the document. The widget should restore its settings from the DOM without relying on an earlier instance.
