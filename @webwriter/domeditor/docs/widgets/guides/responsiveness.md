# Make layouts responsive

A widget can receive less space than the browser window. Fit the width its parent allocates, and let its content determine its height.

![Widget columns reflow into a stack at narrow widths](../../images/widgets/responsiveness.svg)

For a block widget, start with these host styles:

```css
:host {
  display: block;
  box-sizing: border-box;
  max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
  min-inline-size: 0;
  margin-inline: auto;
  container-type: inline-size;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
}
```

Use container queries for layouts that need columns at wider allocations. Apply the query to a descendant inside the shadow DOM. Use `minmax(0, 1fr)` for flexible grid columns and allow long text to wrap.

Check narrow and wide parent containers, nested widgets, and browser zoom. Include 280 CSS px and a narrower allocation. Controls should remain readable without horizontal overflow.

See [Responsiveness](../../responsiveness.md) for container queries, wider widgets, floats, and the test widths.
