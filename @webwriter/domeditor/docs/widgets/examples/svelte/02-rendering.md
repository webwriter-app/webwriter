Write the rendered controls directly in the component and scope the widget styles in its shadow root. The size tokens let the widget fit the editor’s prose column or an explicitly wider widget area.

```svelte
<p>The Moon is a star.</p>
<div class="controls">
  <button type="button" value="true">True</button>
  <button type="button" value="false">False</button>
</div>
<output aria-live="polite"></output>
```

The complete responsive component is [02-rendering.svelte](./02-rendering.svelte).
