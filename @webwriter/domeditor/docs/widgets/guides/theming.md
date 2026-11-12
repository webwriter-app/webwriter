# Follow the theme

A widget can use the document's font, text color, and accent colors. A document stylesheet can use named parts to style specified elements inside the widget. Fallback values keep the text easy to read when a theme value is absent.

![The document’s typography and palette carry over to a timeline widget](../../images/widgets/theming.svg)

## Inherit the theme

Let text [inherit the font and color](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Inheritance) from the widget host. Use a [CSS custom property](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties) when a style needs a specific theme value. Give the property a fallback value. The first timeline marker uses the first accent color. If that color is absent, it uses the current text color.

```css
/* Inside the timeline's shadow stylesheet */
:host {
  display: block;
  color: var(--ww-text-color, inherit);
  font-family: var(--ww-font-family, inherit);
}

.marker {
  background: var(--ww-theme-accent-1, currentColor);
}
```

A document theme can set `--ww-font-family`, `--ww-font-size`, `--ww-text-color`, and `--ww-link-color`. It can also set `--ww-theme-accent-1` through `--ww-theme-accent-7`. Let the document set these properties. If text uses an accent color, check its contrast in each supported theme.

## Expose a named part

Give the first milestone marker a [part name](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/part) in the shadow DOM. A document stylesheet can [use the part name](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::part) to add an outline.

```html
<span class="marker" part="opening-marker" aria-hidden="true"></span>
```

```css
/* In the document stylesheet */
ww-garden-timeline::part(opening-marker) {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
```

Select **Ocean**, **Forest**, or **Sunset** to change the colors. Select **Serif text** to check the document font. Select **Highlight opening** to apply the part style. Select **Standard** to see the fallback colors.

<iframe title="Themeable community garden timeline" src="../examples/preview.html?guide=theming" width="100%" height="360" loading="lazy"></iframe>

[Open the timeline preview](../examples/preview.html?guide=theming) · [Read the example source](../examples/guide-theming.js) · [Design tokens reference](../reference/styling.md)

## Document theme properties and fallback values

## Theme checks for named parts
