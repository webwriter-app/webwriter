Declare `answer` as a reflected string prop. Keep the reader's choice in Svelte state. Read `isContentEditable` on the host element. Update the view when `contenteditable` changes on the host element.

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
