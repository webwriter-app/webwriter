Declare `answer` as a reflected string prop, then keep the player’s choice in Svelte state. The custom element reads the host’s `isContentEditable` property and watches that host attribute so the editor can switch the widget between authoring and preview behavior.

```svelte
<svelte:options
  customElement={{
    tag: "ww-quiz",
    props: {answer: {type: "String", reflect: true}},
  }}
/>

let {answer = "false"} = $props()
let choice = $state("")
```

See [04-state.svelte](./04-state.svelte) for the complete component.
