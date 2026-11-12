Use the native default `<slot>` for the question. The question stays in the light DOM. Authors and collaborators can edit it in the document.

```svelte
<slot><p>Add a question.</p></slot>
```

The slot displays its default question when the widget has no question. See [03-content.svelte](./03-content.svelte).
