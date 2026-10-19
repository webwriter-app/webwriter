Put the quiz controls in the component template and scope their CSS with native Shadow DOM encapsulation. The max-width and padding use the same WebWriter widget sizing tokens as the other tutorial versions.

```ts
template: `
  <p>The Moon is a star.</p>
  <div class="controls">
    <button type="button" value="true">True</button>
    <button type="button" value="false">False</button>
  </div>
  <output aria-live="polite"></output>`,
styles: [":host { display: block; padding: 1rem; }"],
encapsulation: ViewEncapsulation.ShadowDom,
```

The complete responsive styles are in [02-rendering.ts](./02-rendering.ts).
