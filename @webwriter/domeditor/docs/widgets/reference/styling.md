# B5. Design tokens

Put the widget interface and its styles in [shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM). Show authored child content through slots. Export a separate stylesheet for styles that apply to light DOM or to the document.

| Hook | Meaning |
|---|---|
| `:host` | The widget element. |
| `:host([contenteditable])` | A widget with the `contenteditable` attribute. [Support editing](../guides/editing.md) describes how to handle `contenteditable="false"`. |
| `::slotted(…)` | Light DOM elements that the browser assigns to a slot. |
| [`part` / `::part(…)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Shadow_parts) | Named parts that a document stylesheet can style. Declare controls separately. |
| `@media print` | Printed presentation. |
| [`@container`](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) | Layout based on allocated space. |

[Follow the theme](../guides/theming.md) describes document fonts, accent colors, and named parts.

The base theme supplies these properties. A widget can use them in its host styles.

| Property | Default | Purpose |
|---|---|---|
| `--ww-page-max` | `2160px` | Maximum page content width, excluding gutters. |
| `--ww-prose-max` | `45rem` | Normal reading width. |
| `--ww-page-gutter` | `clamp(1rem, 2vw, 2rem)` | Responsive page gutters. |
| `--ww-widget-max` | Uses the prose width by default. | Maximum width of one widget. `none` permits the available page width. |

Let the content of a block widget wrap to fit its parent. Set `min-height` and `max-height` to limit its height. Inline widgets set their own inline styles. The [responsive layout guide](../guides/responsiveness.md) gives recommended widths and a stylesheet example.

Use authored classes, widget parts, or [CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties) for styles that the document must keep. Keep temporary interface state in the widget's shadow DOM.
