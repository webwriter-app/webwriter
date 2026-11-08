# Make layouts responsive

A widget can receive less space than the browser window. Design block widgets for widths from **300px to 2100px**.

Set `min-height` to the space the widget needs to stay usable and `max-height` to limit how tall it can grow. Let the content determine the height within those bounds, and keep overflowing content reachable by scrolling.

![Widget columns reflow into a stack at narrow widths](../../images/widgets/responsiveness.svg)

For a block widget, start with these host styles and adjust the height limits to suit its content:

```css
:host {
  display: block;
  box-sizing: border-box;
  min-width: 300px;
  max-width: 2100px;
  min-height: 12rem;
  max-height: 36rem;
}
```

Use container queries for layouts that need columns at wider allocations. Apply the query to a descendant inside the shadow DOM. Use `minmax(0, 1fr)` for flexible grid columns and allow long text to wrap.

Test at 300px, 2100px, and several widths in between. Check nested widgets and browser zoom too. Controls should remain readable without horizontal overflow, and content should stay reachable when the widget reaches its maximum height.
