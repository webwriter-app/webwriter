Use the native default `<slot>` for the authored question. This leaves question nodes in the document’s light DOM, where the editor and collaboration layer can continue to observe them.

```svelte
<slot><p>Add a question.</p></slot>
```

The fallback appears only when there is no authored question. See [03-content.svelte](./03-content.svelte).
