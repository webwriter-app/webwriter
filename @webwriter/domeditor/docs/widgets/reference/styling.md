# Styling

Put widget UI and its styles in shadow DOM. Render authored children through slots. Export a separate stylesheet when styles must apply to light DOM or document-level content.

| Hook | Meaning |
|---|---|
| `:host` | The widget element. |
| `:host([contenteditable])` | The editor's usual editing presentation; see [editing mode](../guides/editing.md) for authored false values. |
| `::slotted(…)` | Assigned light-DOM elements. |
| `part` / `::part(…)` | Widget-defined styling API. Parts do not automatically create editor controls. |
| `@media print` | Printed presentation. |
| `@container` | Layout based on allocated space. |

The base theme provides these sizing properties. Widgets can use them in their own host styles:

| Property | Default | Purpose |
|---|---|---|
| `--ww-page-max` | `2160px` | Maximum page content width, excluding gutters. |
| `--ww-prose-max` | `45rem` | Normal reading width. |
| `--ww-page-gutter` | `clamp(1rem, 2vw, 2rem)` | Responsive page gutters. |
| `--ww-widget-max` | Falls back to prose width. | Per-widget maximum; `none` allows available page width. |

Block widgets should fit their parent, allow wrapping, and use natural height. Inline widgets choose their own inline formatting. See [responsive layout](../guides/responsiveness.md) for a starting stylesheet and [Responsiveness](../../responsiveness.md) for page and float controls.

Classes beginning with `◆` belong to the editor. Do not depend on them for saved presentation or add editor-only attributes, wrappers, or inline styles to authored content.
