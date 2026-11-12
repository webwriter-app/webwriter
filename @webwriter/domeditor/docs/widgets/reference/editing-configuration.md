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
| `inline` | `boolean` | `false` | Makes a [phrasing](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Content_categories#phrasing_content) widget in `widgetinline`, without automatically adding `flow`. |
| `content` | `string` | None. The authoring tool treats the widget as one unit. | [Content expression](content-expressions.md) for editable light DOM children. |
| `isolating` | `boolean` | `true` | Prevents editing from splitting or joining across the widget boundary. |
| `marks` | `string` | `"_"` | Permitted formatting marks. Use names separated by spaces, `""` for none, or `"_"` for all. |
| `propagateEvents` | `string[]` | `[]` | Types of shadow DOM events that the authoring tool can handle, for example `["keydown"]`. |
| `sharedData` | `boolean` | `false` | Enables [scoped data](data.md) in a direct `script[slot="data"]` child. |
| `importFormats` | `string[]` | `[]` | File format keys that the widget's `convertFrom` handlers support. |
| `exportFormats` | `string[]` | `[]` | File format keys that the widget's `convertTo` handlers support. |

`LocalizedText` is a string or a locale map such as `{"en": "Answer", "de": "Antwort", "_": "Answer"}`. The authoring tool tries the exact locale first. It then tries the language. It uses `_` as the default.

Marks use element names such as `b`, `i`, `a`, and `span` for text styles. The configuration controls how authors edit the current document.

## Advertise file formats

Declare `importFormats` and `exportFormats` in the widget's export entry. Package tools can read these fields before they load the widget. Use a file extension such as `.js` or `.h5p`, or a [media type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types) such as `text/javascript`. Use the same keys in the matching [runtime conversion map](runtime.md#conversions). An extension can identify the format when a file has no media type.

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
