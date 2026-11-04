# Editing configuration

Declare `editingConfig` in `package.json`, or export `./editing-config.json`. The inline configuration is deep-merged over the external file and takes precedence.

Keys identify exports, with or without an extension. `.` supplies package metadata.

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
| `label` | `LocalizedText` | Title-cased member name, omitting the widget's first dash-separated part. | Insertion label; on `.`, package label. |
| `description` | `LocalizedText` | None. | Member description; on `.`, package description. |
| `uninsertable` | `boolean` | `false` | Hides the member from the insertion menu. |
| `group` | `string` | `"flow"` for block widgets. | Space-separated content groups. An explicit value replaces the default group; `widget` or `widgetinline` is always added. |
| `inline` | `boolean` | `false` | Makes a phrasing widget in `widgetinline`, without automatically adding `flow`. |
| `content` | `string` | None; atomic. | [Content expression](content-expressions.md) for editable light-DOM children. |
| `isolating` | `boolean` | `true` | Prevents editing from splitting or joining across the widget boundary. |
| `marks` | `string` | `"_"` | Allowed formatting marks: space-separated names, `""` for none, or `"_"` for all. |
| `propagateEvents` | `string[]` | `[]` | Shadow-DOM event types editor features may handle, for example `["keydown"]`. |
| `sharedData` | `boolean` | `false` | Enables [scoped data](data.md) in a direct `script[slot="data"]` child. |
| `importFormats` | `string[]` | `[]` | Advertises file format keys implemented by the widget's `convertFrom` handlers. |
| `exportFormats` | `string[]` | `[]` | Advertises file format keys implemented by the widget's `convertTo` handlers. |

`LocalizedText` is a string or a locale map such as `{"en": "Answer", "de": "Antwort", "_": "Answer"}`. Matching tries the exact locale, its language, then `_`.

Marks use element names such as `b`, `i`, `a`, and `span` for text styles. Configuration describes editing behavior; it does not replace or normalize the current document into a separate model.

## Advertise file formats

Put `importFormats` and `exportFormats` on the widget's export entry. Package tools can read these declarations before loading the widget. Use a literal file extension such as `.js` or `.h5p`, or a concrete media type such as `text/javascript`. Use the same keys in the corresponding [runtime conversion map](runtime.md#conversions). An extension key lets a package advertise support even when a file has no reported media type.

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
