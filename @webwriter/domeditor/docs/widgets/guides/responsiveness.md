# Make layouts responsive

A responsive widget changes its layout to fit the available space. It can move content into one column when the space is narrow or use more columns when space permits. Its controls stay available when the content scrolls.

![Widget columns reflow into a stack at narrow widths](../../images/widgets/responsiveness.svg)

Design block widgets for widths from **300px to 2100px**. Set [`min-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/min-height) to the minimum height for access to the controls. Set `max-height` to limit the height. Let the content set the height within these limits. Use scrolling to give readers access to content outside the view.

Use these host styles for a block widget. Change the height limits to suit the content.

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

Use a [container query](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) to add columns when more space is available. A weather display can show current conditions and the forecast side by side in a wide container. It can put them in one column in a narrow container. Apply the query to a descendant in the shadow DOM. Use [`minmax(0, 1fr)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/minmax) for flexible columns. Let long text wrap.

Test at 300px, 2100px, and intermediate widths. Test nested widgets. Test different browser zoom levels. Make sure that controls stay readable without horizontal scrolling. Check access to the content at the maximum widget height.

## Layout at different widths

## Overflow and nested widgets
