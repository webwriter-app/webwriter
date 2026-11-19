# A3. Editing configuration

Declare `editingConfig` in [`package.json`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) or export `./editing-config.json`. The authoring tool merges object fields recursively. Inline values have priority over values from the external file.

A key identifies an export with or without its extension. The key `.` supplies package metadata.

```json
{
  "editingConfig": {
    ".": {"label": {"_": "Quiz", "de": "Quiz"}},
    "./widgets/ww-quiz": {"label": "Quiz", "content": "p+", "sharedData": true}
  }
}
```

| Option | Type | Default | Effect |
|---|---|---|---|
| `label` | `LocalizedText` | Member name in title case. For a widget, this omits the part before the first hyphen. | Label in the insertion menu. On `.`, this is the package label. |
| `description` | `LocalizedText` | None. | Member description. On `.`, this is the package description. |
| `uninsertable` | `boolean` | `false` | Hides the member from the insertion menu. |
| `group` | `string` | `"flow"` for block widgets. | Content groups separated by spaces. An explicit value replaces the default group. The authoring tool always adds `widget` or `widgetinline`. |
| `movable` | `boolean` | `true` | Set `false` to disable moving or dragging the widget itself and hide the transformation frame's Move control. Its authored children remain editable, and its parent can still be moved. |
| `resize` | `"inline" \| "block" \| "both" \| "none"` | Existing element behavior. | Declares the logical axes the editor may resize. The frame filters handles and enforces the rule during resizing, including groups. For a content-height widget, use `"inline"` and CSS `block-size: auto`. |
| `inline` | `boolean` | `false` | Makes a [phrasing](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Content_categories#phrasing_content) widget in `widgetinline`, without automatically adding `flow`. |
| `content` | `string` | None. The authoring tool treats the widget as one unit. | [Content expression](content-expressions.md) for editable light DOM children. |
| `isolating` | `boolean` | `true` | Prevents splitting, joining, and partial text selections across the widget boundary. The widget remains selectable as a whole from outside. Use `false` to allow text ranges to cross its authored content. |
| `marks` | `string` | `"_"` | Permitted formatting marks. Use names separated by spaces, `""` for none, or `"_"` for all. |
| `propagateEvents` | `string[]` | `[]` | Types of shadow DOM events that the authoring tool can handle, for example `["keydown"]`. |
| `sharedData` | `boolean` | `false` | Enables [scoped data](data.md) in a direct `script[slot="data"]` child. |
| `importFormats` | `string[]` | `[]` | File format keys that the widget's `convertFrom` handlers support. Extensions and media types only, never HTML tag names. |
| `exportFormats` | `string[]` | `[]` | File format keys that the widget's `convertTo` handlers support. Extensions and media types only, never HTML tag names. |

`LocalizedText` is a string or a locale map such as `{"en": "Answer", "de": "Antwort", "_": "Answer"}`. The authoring tool tries the exact locale first. It then tries the language. It uses `_` as the default.

Marks use element names such as `b`, `i`, `a`, and `span` for text styles. The configuration controls how authors edit the current document.

## Restrict placement and movement

Constrain placement through the receiving element's `content` expression and the child's `group` membership. For a structural child, use an explicit `group: ""` to remove the default `flow` membership, and name the child type in the parent's content expression. The document body and other `flow` containers then reject that child.

The editor still adds the `widget` group. A container declaring `widget*` deliberately accepts all block widget types, including structural children. Use `flow*` for general document content and explicit types or custom groups for structured content. `uninsertable` only hides an insertion-menu entry; it does not impose a structural restriction.

Set `movable: false` when the editor must not move or drag that element. This disables its native editor drag handle and the transformation frame's Move affordance. It does not lock the authored content or prevent moving the containing widget. Other editing permissions remain independent.

For example, a timeline accepts event children by type, while events stay out of general flow content and reorder through their dates rather than manual movement:

```json
{
  "editingConfig": {
    "./widgets/webwriter-timeline": {
      "content": "webwriter-timeline-event*",
      "resize": "inline"
    },
    "./widgets/webwriter-timeline-event": {
      "group": "",
      "content": "h2 flow+",
      "movable": false,
      "resize": "none",
      "uninsertable": true
    }
  }
}
```

The event's own [content expression](content-expressions.md) requires a leading title heading and one or more body elements. Another container can accept events by deliberately naming their type or a group they belong to. Use a [migration](../guides/migrations.md) when changing an existing package's authored representation.

## Declare resize axes

`resize` controls which logical dimensions the editor may resize. It does not set CSS dimensions or prevent the widget from growing as its content changes.

| Value | Editor resizing |
|---|---|
| Omitted | Keeps the usual behavior for the element and document layout. |
| `"inline"` | Permits the inline axis only. In horizontal writing, this changes width while content determines height. |
| `"block"` | Permits the block axis only. In horizontal writing, this changes height. |
| `"both"` | Permits both axes, subject to the usual layout, size and aspect-ratio constraints. |
| `"none"` | Disables editor resizing of this element. Content and responsive styles can still change its size. |

The axes follow the widget's computed `writing-mode`. In vertical writing, the inline axis is vertical and the block axis is horizontal. The editor filters resize handles and enforces the rule during the gesture; group resizing also respects each member's rule.

For a widget that should resize horizontally and flow vertically in ordinary horizontal writing, declare `resize: "inline"` and let its CSS use `block-size: auto`. Avoid a fixed block size that would stop the content from determining its height. The timeline example above uses this rule on the parent and `resize: "none"` on its individual events.

See [Handle selection & input](../guides/focus.md) for native editor drag handles, capture selection, insertion focus and the `selectionStates` runtime property. `selectionStates` belongs on the element instance, not in `editingConfig`.

## Advertise file formats

Declare `importFormats` and `exportFormats` in the widget's export entry. Package tools can read these fields before they load the widget. Use a file extension such as `.js` or `.h5p`, or a [media type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types) such as `text/javascript`. Use the same keys in the matching [runtime conversion map](runtime.md#conversions). An extension can identify the format when a file has no media type.

These lists contain file formats only. A key of a conversion map that is a lowercase HTML tag name, such as `ul`, is an HTML conversion. The runtime map declares it, and these lists do not. A tag name or a wildcard such as `image/*` in a list is invalid, and the Develop drawer reports it.

```json
{
  "editingConfig": {
    "./widgets/ww-code": {
      "importFormats": ["text/javascript", ".js"],
      "exportFormats": ["text/javascript"]
    }
  }
}
```

An inline list replaces the corresponding list from `./editing-config.json`. Use an empty list to clear an inherited declaration.
