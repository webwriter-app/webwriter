Declare the public tag name in `<svelte:options>`. The compiler creates and registers the custom-element constructor.

```svelte
<svelte:options customElement={{ tag: "ww-quiz" }} />

<p>Quiz widget</p>
```

The complete source is [01-setup.svelte](./01-setup.svelte).
