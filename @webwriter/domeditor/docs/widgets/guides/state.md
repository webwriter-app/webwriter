# Manage state

WebWriter offers several ways to organize your widget's state.

![A widget linked to properties, attributes, content, and data](../../images/widgets/state.svg)

Use properties for temporary state and attributes for settings that authors should save, share, and undo. For example, a metronome can save its selected sound as an attribute and keep the visibility of its sound details in memory.

<!-- library:vanilla -->
```js
get sound() { return this.getAttribute("sound") ?? "woodblock" }
set sound(value) { this.setAttribute("sound", value) }
```

Observe the attribute to update your display when a collaborator or undo changes it:

```js
static observedAttributes = ["sound"]

attributeChangedCallback(name, previous, current) {
  if(previous !== current) this.update()
}
```
<!-- /library -->
<!-- library:lit -->
In your `LitElementWw` class, declare a reactive property and reflect its changes to an attribute:

```js
static properties = {sound: {type: String, reflect: true}}

constructor() {
  super()
  this.sound = "woodblock"
}
```

Lit reads later attribute changes, including remote changes and undo, and updates the template. Use `{state: true}` for local reactive properties that should not become attributes.
<!-- /library -->

<!-- library:react -->
Keep saved settings on the custom-element host. Its bridge reads the current `sound` attribute and passes it to the React component whenever the attribute changes, including collaboration and undo. Use `useState` for the visibility of the sound details:

```jsx
function Metronome({sound = "woodblock"}) {
  const [showDetails, setShowDetails] = useState(false)
  return <>
    <button aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
      Sound details
    </button>
    {showDetails && <p>Selected sound: {sound}</p>}
  </>
}
```

See the [tutorial’s state step](../tutorial/04-state.md) for a complete React host bridge.
<!-- /library -->

<!-- library:vue -->
Keep saved settings on the custom-element host. The registration bridge reads its `sound` attribute and notifies the single-file component when it changes, including collaboration and undo. Use a Vue ref for the visibility of the sound details:

```vue
<script setup>
import {ref} from "vue"
defineProps({sound: {type: String, default: "woodblock"}})
const showDetails = ref(false)
</script>
<template>
  <button :aria-expanded="showDetails" @click="showDetails = !showDetails">Sound details</button>
  <p v-if="showDetails">Selected sound: {{ sound }}</p>
</template>
```

See the [tutorial’s state step](../tutorial/04-state.md) for a complete Vue component and registration module.
<!-- /library -->

<!-- library:angular -->
Declare the saved setting as a decorated Angular input. Angular Elements maps the host's `sound` attribute to that input, so later attribute changes from collaboration or undo update the component. Keep the visibility of the sound details on the component:

```ts
@Input() sound = "woodblock"
showDetails = false

toggleDetails() {
  this.showDetails = !this.showDetails
}
```

See the [tutorial’s state step](../tutorial/04-state.md) for a complete Angular component and native host bridge.
<!-- /library -->

<!-- library:svelte -->
Declare the saved setting as a reflected custom-element prop. Use local Svelte state for the visibility of the sound details:

```svelte
<svelte:options customElement={{
  tag: "ww-metronome",
  props: {sound: {type: "String", reflect: true}},
}} />
<script>
  let {sound = "woodblock"} = $props()
  let showDetails = $state(false)
</script>
```

Later attribute changes update the component prop, including remote changes and undo. See the [tutorial’s state step](../tutorial/04-state.md) for a complete Svelte example.
<!-- /library -->

Route changes to saved settings through the host attribute, whether the author changes them in your widget or in the editor.

Keep authored text in light-DOM children. Use a [scoped data block](sharing.md) for persistent participant data. Normal exports retain the block's authored defaults.

To check settings, save and reopen the document. The widget should restore its settings from the DOM without relying on an earlier instance.

## Options, actions, and undo

An editor option is a convenient way to edit an authored setting; an action is a named operation the editor can invoke. Both belong in static metadata on the registered custom-element class. Keep the setting in an attribute so the editor can observe and record it. A property getter can provide a default without writing an attribute until the author changes the value.

This metronome uses `tempo` as its authored setting. Its play/pause state and beat counter are temporary properties. The editor option writes the `tempo` attribute, and the action resets that same attribute. Undo and redo therefore work through the ordinary DOM attribute change.

```js
static options = {
  tempo: {
    type: "number",
    label: {_: "Tempo"},
    min: 40,
    max: 240,
    step: 1,
  },
}

static actions = {
  resetTempo: {label: {_: "Reset tempo"}},
}

get tempo() { return Number(this.getAttribute("tempo") ?? 120) }
set tempo(value) { this.setAttribute("tempo", String(value)) }

resetTempo() { this.tempo = 120 }
```

The widget updates its beat interval when `tempo` changes, including after an editor option change, undo, redo, or collaboration update. Start the metronome, change **Tempo** in its drawer, then select **Reset tempo**. The preview uses the standalone drawer with the same option and action declarations WebWriter reads in the editor.

<iframe title="Metronome with tempo option and reset action" src="../examples/preview.html?guide=state" width="100%" height="260" loading="lazy"></iframe>

[Open the metronome preview](../examples/preview.html?guide=state) · [View the example source](../examples/guide-state.js) · [Options and actions reference](../reference/options-actions.md)
