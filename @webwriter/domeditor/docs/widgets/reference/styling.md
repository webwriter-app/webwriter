# B5. Design tokens

Put the widget interface and its styles in [shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM). Show authored child content through slots. Export a separate stylesheet for styles that apply to light DOM or to the document.

| Hook | Meaning |
|---|---|
| `:host` | The widget element. |
| `:host([contenteditable])` | A widget with the `contenteditable` attribute. [Support editing](../guides/editing.md) describes how to handle `contenteditable="false"`. |
| `::slotted(…)` | Light DOM elements that the browser assigns to a slot. |
| [`part` / `::part(…)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Shadow_parts) | Named parts that a document stylesheet can style. Declare controls separately. |
| `@media print` | Printed presentation. |
| `:host(.ww-beforeprint)` | A widget while the editor prints the document or previews it. The editor adds the class `ww-beforeprint` to every installed widget element between `beforeprint` and `afterprint`, and removes it afterwards. The class is runtime state, not saved or shared. See [Support printing](../guides/printing.md#the-class-ww-beforeprint). |
| [`@container`](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) | Layout based on allocated space. |

[Follow the theme](../guides/theming.md) describes document fonts, accent colors, and named parts.

The base theme supplies these properties. A widget can use them in its host styles.

| Property | Default | Purpose |
|---|---|---|
| `--ww-page-max` | `2160px` | Maximum page content width, excluding gutters. |
| `--ww-prose-max` | `45rem` | Normal reading width. |
| `--ww-page-gutter` | `clamp(1rem, 2vw, 2rem)` | Responsive page gutters. |
| `--ww-widget-max` | Uses the prose width by default. | Maximum width of one widget. `none` permits the available page width. The theme applies it to every block widget with a rule that wins over the widget's `:host` rule, so a widget sets this property and not `max-width`. See [Maximum width](../guides/responsiveness.md#maximum-width). |

The theme also supplies colors. A widget reads each with a fallback, as [Follow the theme](../guides/theming.md#document-theme-properties-and-fallback-values) shows.

| Property | Default | Purpose |
|---|---|---|
| `--ww-font-family`, `--ww-font-size`, `--ww-text-color`, `--ww-link-color` | Set by the theme, or unset. | Text font and size, text color, link color. Fallback: `inherit`. |
| `--ww-theme-accent-1` to `--ww-theme-accent-7` | Set by a saved theme, or unset. | Seven accent colors. Fallbacks: `#44546a`, `#5b9bd5`, `#ed7d31`, `#f04b22`, `#ffc000`, `#8064a2`, `#70ad47`. |
| `--ww-surface` | `Canvas` | Background of a surface that a widget draws on. |
| `--ww-border-color` | The text color at 60 % strength. | Borders and dividers. |
| `--ww-focus-color` | `light-dark(#0b5cad, #8ab4f8)` | Focus ring. |
| `--ww-success`, `--ww-danger`, `--ww-warning` | `light-dark(#1b7a3d, #7bd88f)`, `light-dark(#b3261e, #f2918a)`, `light-dark(#8a5a00, #f0c05a)` | Correct, wrong, and cautionary states. |

A theme with a dark page sets `color-scheme: dark` on the root. The color tokens use `light-dark()` and take their dark values from it.

The editor sends `ww-themechange` on the document after the theme changed. It bubbles and is not cancelable, and `detail.theme` names the bundled theme. A widget that reads computed colors at draw time listens to it and draws again.

Let the content of a block widget wrap to fit its parent. Set `min-height` and `max-height` to limit its height, or use an `aspect-ratio` for a canvas. Inline widgets set their own inline styles. The [responsive layout guide](../guides/responsiveness.md) gives recommended widths, heights, and a stylesheet example.

Use authored classes, widget parts, or [CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties) for styles that the document must keep. Keep temporary interface state in the widget's shadow DOM.
