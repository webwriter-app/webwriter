Declare the public tag in `<svelte:options>`. The compiler generates and registers the custom-element constructor for this component.

```svelte
<svelte:options customElement={{ tag: "ww-quiz" }} />

<p>Quiz widget</p>
```

The complete source is [01-setup.svelte](./01-setup.svelte).
