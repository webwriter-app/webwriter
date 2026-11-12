Put the quiz controls in the component template. Use native shadow DOM encapsulation to limit the CSS to the component. The CSS uses document design tokens to set the maximum width and padding.

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

The complete styles are in [02-rendering.ts](./02-rendering.ts).
