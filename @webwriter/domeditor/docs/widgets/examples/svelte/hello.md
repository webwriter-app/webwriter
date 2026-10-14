Svelte’s custom-element mode compiles this component into a browser custom element. The default slot displays authored light-DOM children while Svelte keeps the component view and styles inside its shadow root.

```svelte
<svelte:options customElement={{ tag: "ww-hello" }} />

<p>Hello, <slot>world</slot>!</p>
```

See the [Svelte custom elements documentation](https://svelte.dev/docs/svelte/custom-elements) and the full source in [hello.svelte](./hello.svelte).
