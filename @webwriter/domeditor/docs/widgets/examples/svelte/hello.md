Svelte compiles this component into a custom element. The default slot displays the child content. The child content stays in the light DOM. The view and styles stay in the shadow root.

```svelte
<svelte:options customElement={{ tag: "ww-hello" }} />

<p>Hello, <slot>world</slot>!</p>
```

See the [Svelte custom elements documentation](https://svelte.dev/docs/svelte/custom-elements) and the complete source in [hello.svelte](./hello.svelte).
