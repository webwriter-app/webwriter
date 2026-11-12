Put the controls in the component. Keep the styles in its shadow root. The size tokens let the widget fit the document column or a larger area.

```svelte
<p>The Moon is a star.</p>
<div class="controls">
  <button type="button" value="true">True</button>
  <button type="button" value="false">False</button>
</div>
<output aria-live="polite"></output>
```

The complete component is [02-rendering.svelte](./02-rendering.svelte).
